const CORS_ORIGIN = "https://unsealed.space";
const VIEWER_BASE = "https://unsealed.space/components/track/";

// --- Helpers ---

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || CORS_ORIGIN;
  const allowed = origin === CORS_ORIGIN
    || origin.startsWith("http://localhost:")
    || origin.startsWith("http://127.0.0.1:")
;
  return {
    "Access-Control-Allow-Origin": allowed ? origin : CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status = 200, request = null) {
  const headers = { "Content-Type": "application/json" };
  if (request) Object.assign(headers, corsHeaders(request));
  return new Response(JSON.stringify(data), { status, headers });
}

function error(message, status, request) {
  return json({ error: message }, status, request);
}

function isValidAdmin(token, env) {
  const secrets = env.ADMIN_SECRET.trim().split(",");
  return secrets.some(s => s.trim() === token.trim());
}

function generateId(length) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

const KV_TTL = 30 * 24 * 60 * 60; // 30 days in seconds
const FINISH_RADIUS = 150; // meters — GPS point within this distance of last route point = finished
const MIN_TRACK_POINTS_FOR_FINISH = 20; // avoid false trigger at start of loop courses

// --- Haversine ---

const EARTH_RADIUS = 6371000;

function toRad(deg) {
  return deg * Math.PI / 180;
}

function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- GPX Parsing ---

function parseGpx(gpxString) {
  // Use regex to extract trkpt elements — GPX is simple enough
  const points = [];
  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  const eleRegex = /<ele>([^<]+)<\/ele>/;
  let match;

  while ((match = trkptRegex.exec(gpxString)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const inner = match[3];
    const eleMatch = eleRegex.exec(inner);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : null;
    points.push({ lat, lon, ele });
  }

  if (points.length === 0) {
    throw new Error("No trackpoints found in GPX");
  }

  // Compute cumulative distance
  let cumDist = 0;
  points[0].cumDist = 0;
  for (let i = 1; i < points.length; i++) {
    cumDist += haversine(
      points[i - 1].lat, points[i - 1].lon,
      points[i].lat, points[i].lon
    );
    points[i].cumDist = cumDist;
  }

  return points;
}

function snapAidStations(aidStations, route) {
  const totalDist = route[route.length - 1].cumDist;

  return aidStations.map(station => {
    const targetDist = station.distance_km * 1000;
    let bestIdx = 0;
    let bestDiff = Infinity;

    for (let i = 0; i < route.length; i++) {
      const diff = Math.abs(route[i].cumDist - targetDist);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    return {
      name: station.name,
      lat: station.lat || route[bestIdx].lat,
      lon: station.lon || route[bestIdx].lon,
      distance_km: station.distance_km,
      route_index: bestIdx,
    };
  });
}

// --- Route Handlers ---

async function handleCreateRace(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match || !isValidAdmin(match[1], env)) {
    return error("Unauthorized", 401, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body", 400, request);
  }

  const { name, gpx, aid_stations, start_time, end_time } = body;
  if (!name || !gpx) {
    return error("Missing required fields: name, gpx", 400, request);
  }

  let route;
  try {
    route = parseGpx(gpx);
  } catch (e) {
    return error(`GPX parsing failed: ${e.message}`, 400, request);
  }

  const id = generateId(16);
  const token = generateToken();
  const totalDistKm = route[route.length - 1].cumDist / 1000;
  const snappedStations = snapAidStations(aid_stations || [], route);

  const meta = {
    id,
    name,
    token,
    created_at: new Date().toISOString(),
    start_time: start_time ? new Date(start_time).toISOString() : null,
    end_time: end_time ? new Date(end_time).toISOString() : null,
    route,
    aid_stations: snappedStations,
    total_distance_km: Math.round(totalDistKm * 100) / 100,
  };

  const emptyLive = {
    current_location: null,
    track: "",
  };

  await Promise.all([
    env.RACE_DATA.put(`race:${id}:meta`, JSON.stringify(meta), {
      expirationTtl: KV_TTL,
      metadata: { name, created_at: meta.created_at, total_distance_km: meta.total_distance_km },
    }),
    env.RACE_DATA.put(`race:${id}:live`, JSON.stringify(emptyLive), { expirationTtl: KV_TTL }),
  ]);

  return json({
    id,
    token,
    viewer_url: `${VIEWER_BASE}tracker.html?id=${id}`,
  }, 201, request);
}

async function handleLocationUpdate(request, env, raceId) {
  // Verify race exists and auth token matches
  const metaRaw = await env.RACE_DATA.get(`race:${raceId}:meta`);
  if (!metaRaw) return error("Race not found", 404, request);

  const meta = JSON.parse(metaRaw);
  const authHeader = request.headers.get("Authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/);
  const bearerToken = bearerMatch ? bearerMatch[1] : "";
  if (bearerToken !== meta.token) {
    return error("Unauthorized", 401, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error("Invalid JSON body", 400, request);
  }

  const locations = body.locations;
  if (!Array.isArray(locations) || locations.length === 0) {
    return error("No locations provided", 400, request);
  }

  // Read current live data
  const liveRaw = await env.RACE_DATA.get(`race:${raceId}:live`);
  const live = liveRaw ? JSON.parse(liveRaw) : { current_location: null, track: "" };

  // Race already finished — accept request but discard data
  if (live.finished_at) {
    return json({ result: "ok" }, 200, request);
  }

  // Process all locations, filtering by race time window
  const raceStart = meta.start_time ? new Date(meta.start_time).getTime() : null;
  const raceEnd = meta.end_time ? new Date(meta.end_time).getTime() : null;
  const newTrackLines = [];
  let latest = null;

  for (const loc of locations) {
    const coords = loc.geometry?.coordinates;
    const props = loc.properties || {};
    if (!coords) continue;
    if (coords[0] === 0 && coords[1] === 0) continue;

    const ts = props.timestamp || new Date().toISOString();
    const tsMs = new Date(ts).getTime();

    if (raceStart && tsMs < raceStart) continue;
    if (raceEnd && tsMs > raceEnd) continue;

    const point = {
      lat: coords[1],
      lon: coords[0],
      altitude: props.altitude ?? null,
      speed: props.speed ?? null,
      timestamp: ts,
      accuracy: props.horizontal_accuracy ?? null,
    };

    newTrackLines.push(JSON.stringify(point));

    if (!latest || point.timestamp > latest.timestamp) {
      latest = point;
    }
  }

  if (latest) {
    live.current_location = latest;
  }

  // Append to track (newline-delimited JSON)
  if (newTrackLines.length > 0) {
    live.track = live.track
      ? live.track + "\n" + newTrackLines.join("\n")
      : newTrackLines.join("\n");
  }

  // Detect finish: runner close to last route point after enough tracking
  if (latest && !live.finished_at) {
    const trackPointCount = live.track ? live.track.split("\n").length : 0;
    if (trackPointCount >= MIN_TRACK_POINTS_FOR_FINISH) {
      const finish = meta.route[meta.route.length - 1];
      const distToFinish = haversine(latest.lat, latest.lon, finish.lat, finish.lon);
      if (distToFinish < FINISH_RADIUS) {
        live.finished_at = latest.timestamp;
      }
    }
  }

  await env.RACE_DATA.put(`race:${raceId}:live`, JSON.stringify(live), { expirationTtl: KV_TTL });

  return json({ result: "ok" }, 200, request);
}

async function handleResetTrack(request, env, raceId) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match || !isValidAdmin(match[1], env)) {
    return error("Unauthorized", 401, request);
  }

  const metaRaw = await env.RACE_DATA.get(`race:${raceId}:meta`);
  if (!metaRaw) return error("Race not found", 404, request);

  const emptyLive = { current_location: null, track: "", finished_at: null };
  await env.RACE_DATA.put(`race:${raceId}:live`, JSON.stringify(emptyLive), { expirationTtl: KV_TTL });

  return json({ result: "ok" }, 200, request);
}

async function handleDeleteRace(request, env, raceId) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match || !isValidAdmin(match[1], env)) {
    return error("Unauthorized", 401, request);
  }

  const metaRaw = await env.RACE_DATA.get(`race:${raceId}:meta`);
  if (!metaRaw) return error("Race not found", 404, request);

  await Promise.all([
    env.RACE_DATA.delete(`race:${raceId}:meta`),
    env.RACE_DATA.delete(`race:${raceId}:live`),
  ]);

  return json({ result: "ok" }, 200, request);
}

async function handleListRaces(request, env) {
  const list = await env.RACE_DATA.list({ prefix: "race:" });
  const metaKeys = list.keys.filter(k => k.name.endsWith(":meta"));

  const races = [];
  for (const key of metaKeys) {
    const id = key.name.split(":")[1];
    if (key.metadata?.name) {
      races.push({
        id,
        name: key.metadata.name,
        created_at: key.metadata.created_at,
        total_distance_km: key.metadata.total_distance_km,
      });
    } else {
      const raw = await env.RACE_DATA.get(key.name);
      if (!raw) continue;
      const meta = JSON.parse(raw);
      races.push({
        id,
        name: meta.name,
        created_at: meta.created_at,
        total_distance_km: meta.total_distance_km,
      });
    }
  }

  races.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return json({ races }, 200, request);
}

async function handleVerifyAuth(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match || !isValidAdmin(match[1], env)) {
    return error("Unauthorized", 401, request);
  }
  return json({ result: "ok" }, 200, request);
}

async function handleGetRoute(request, env, raceId) {
  const metaRaw = await env.RACE_DATA.get(`race:${raceId}:meta`);
  if (!metaRaw) return error("Race not found", 404, request);

  const meta = JSON.parse(metaRaw);
  const response = {
    name: meta.name,
    total_distance_km: meta.total_distance_km,
    start_time: meta.start_time || null,
    end_time: meta.end_time || null,
    aid_stations: meta.aid_stations,
    route: meta.route,
  };

  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=86400",
    ...corsHeaders(request),
  };

  return new Response(JSON.stringify(response), { status: 200, headers });
}

async function handleGetLive(request, env, raceId) {
  const liveRaw = await env.RACE_DATA.get(`race:${raceId}:live`);
  if (!liveRaw) return error("Race not found", 404, request);

  const live = JSON.parse(liveRaw);

  // Parse newline-delimited track back into array
  const track = live.track
    ? live.track.split("\n").map(line => JSON.parse(line))
    : [];

  return json({
    current_location: live.current_location,
    track,
  }, 200, request);
}

// --- Router ---

function matchRoute(method, path) {
  if (method === "GET" && path === "/api/races") {
    return { handler: "listRaces" };
  }

  if (method === "POST" && path === "/api/auth/verify") {
    return { handler: "verifyAuth" };
  }

  if (method === "POST" && path === "/api/race") {
    return { handler: "createRace" };
  }

  const locationMatch = path.match(/^\/api\/race\/([a-z0-9]+)\/location$/);
  if (method === "POST" && locationMatch) {
    return { handler: "location", raceId: locationMatch[1] };
  }

  const resetMatch = path.match(/^\/api\/race\/([a-z0-9]+)\/reset$/);
  if (method === "POST" && resetMatch) {
    return { handler: "reset", raceId: resetMatch[1] };
  }

  const deleteMatch = path.match(/^\/api\/race\/([a-z0-9]+)$/);
  if (method === "DELETE" && deleteMatch) {
    return { handler: "deleteRace", raceId: deleteMatch[1] };
  }

  const routeMatch = path.match(/^\/api\/race\/([a-z0-9]+)\/route$/);
  if (method === "GET" && routeMatch) {
    return { handler: "route", raceId: routeMatch[1] };
  }

  const liveMatch = path.match(/^\/api\/race\/([a-z0-9]+)\/live$/);
  if (method === "GET" && liveMatch) {
    return { handler: "live", raceId: liveMatch[1] };
  }

  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const matched = matchRoute(request.method, path);
    if (!matched) {
      return error("Not found", 404, request);
    }

    switch (matched.handler) {
      case "listRaces":
        return handleListRaces(request, env);
      case "verifyAuth":
        return handleVerifyAuth(request, env);
      case "createRace":
        return handleCreateRace(request, env);
      case "location":
        return handleLocationUpdate(request, env, matched.raceId);
      case "reset":
        return handleResetTrack(request, env, matched.raceId);
      case "deleteRace":
        return handleDeleteRace(request, env, matched.raceId);
      case "route":
        return handleGetRoute(request, env, matched.raceId);
      case "live":
        return handleGetLive(request, env, matched.raceId);
    }
  },
};
