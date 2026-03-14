const OFF_ROUTE_THRESHOLD = 200; // meters

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Project point P onto segment AB. Returns t in [0,1] — the fraction along AB.
function projectOntoSegment(pLat, pLon, aLat, aLon, bLat, bLon) {
  const dx = bLon - aLon;
  const dy = bLat - aLat;
  if (dx === 0 && dy === 0) return 0;
  const t = ((pLon - aLon) * dx + (pLat - aLat) * dy) / (dx * dx + dy * dy);
  return Math.max(0, Math.min(1, t));
}

// Snap a GPS point to the nearest position on the route.
// previousSnapIndex enables continuity constraint for self-crossing routes.
const CONTINUITY_WINDOW = 50; // segments around previous snap to prefer

function snapToRoute(lat, lon, route, previousSnapIndex) {
  let bestDist = Infinity;
  let bestIdx = 0;
  let bestT = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const t = projectOntoSegment(lat, lon, a.lat, a.lon, b.lat, b.lon);
    const snapLat = a.lat + t * (b.lat - a.lat);
    const snapLon = a.lon + t * (b.lon - a.lon);
    const dist = haversine(lat, lon, snapLat, snapLon);

    // Apply continuity bias: slightly penalize segments far from previous snap
    let effective = dist;
    if (previousSnapIndex !== undefined && previousSnapIndex !== null) {
      const segmentDist = Math.abs(i - previousSnapIndex);
      if (segmentDist > CONTINUITY_WINDOW) {
        effective = dist + 50; // 50m penalty for distant segments
      }
    }

    if (effective < bestDist) {
      bestDist = effective;
      bestIdx = i;
      bestT = t;
    }
  }

  const a = route[bestIdx];
  const b = route[bestIdx + 1];
  const snappedLat = a.lat + bestT * (b.lat - a.lat);
  const snappedLon = a.lon + bestT * (b.lon - a.lon);
  const actualDist = haversine(lat, lon, snappedLat, snappedLon);
  const distAlongRoute = a.cumDist + bestT * (b.cumDist - a.cumDist);

  return {
    lat: snappedLat,
    lon: snappedLon,
    segmentIndex: bestIdx,
    distAlongRoute,
    offRoute: actualDist > OFF_ROUTE_THRESHOLD,
    distFromRoute: actualDist,
  };
}
