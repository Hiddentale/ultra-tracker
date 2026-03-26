const POLL_INTERVAL = 20000;
const FINISH_THRESHOLD = 0.98;

let raceId = null;
let routeData = null;
let previousSnapIndex = null;
let raceFinished = false;
let maxDistAlongRoute = 0;

function getRaceId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function showError(msg) {
  const banner = document.getElementById("error-banner");
  banner.textContent = msg;
  banner.classList.add("visible");
}

function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

function updateStaleness(timestamp) {
  const dot = document.getElementById("staleness-dot");
  const text = document.getElementById("staleness-text");

  if (!timestamp) {
    text.textContent = "No data yet";
    dot.className = "staleness-dot old";
    return;
  }

  const ageMs = Date.now() - new Date(timestamp).getTime();
  const ageSec = Math.floor(ageMs / 1000);
  const ageMin = Math.floor(ageSec / 60);

  if (ageSec < 120) {
    text.textContent = `${ageSec}s ago`;
    dot.className = "staleness-dot fresh";
  } else if (ageMin < 5) {
    text.textContent = `${ageMin} min ago`;
    dot.className = "staleness-dot stale";
  } else {
    text.textContent = `${ageMin} min ago`;
    dot.className = "staleness-dot old";
  }
}

function renderAidStations(stations) {
  const list = document.getElementById("aid-station-list");
  const upcoming = stations.filter(s => !s.passed);

  if (upcoming.length === 0) {
    list.innerHTML = '<div class="aid-station"><div class="aid-name">Finished!</div></div>';
    return;
  }

  const next = upcoming[0];
  const distStr = next.remaining_km != null ? `${next.remaining_km} km away` : "";
  const etaStr = next.eta
    ? next.eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "--";

  list.innerHTML = `
    <div class="aid-station">
      <div class="aid-name">${next.name}</div>
      <div class="aid-details">${distStr}</div>
      <div class="aid-eta">${etaStr}</div>
    </div>`;
}

function formatHMS(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function updatePrediction(track, distAlongRoute, totalDist, pace) {
  const elapsedEl = document.getElementById("elapsed-value");
  const remainingEl = document.getElementById("remaining-value");
  const finishEl = document.getElementById("finish-value");

  if (!track.length) {
    elapsedEl.textContent = "--";
    remainingEl.textContent = "--";
    finishEl.textContent = "--";
    return;
  }

  const startTime = new Date(track[0].timestamp).getTime();
  const now = Date.now();
  const elapsed = now - startTime;

  elapsedEl.textContent = formatHMS(elapsed);

  if (!pace) {
    remainingEl.textContent = "--";
    finishEl.textContent = "--";
    return;
  }

  const remainingDist = totalDist - distAlongRoute;
  if (remainingDist <= 0) {
    remainingEl.textContent = "0m";
    finishEl.textContent = "Done!";
    return;
  }

  const remainingMs = remainingDist * pace;
  remainingEl.textContent = formatHMS(remainingMs);

  const finishTime = new Date(now + remainingMs);
  finishEl.textContent = finishTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function updateStats(distAlongRoute, totalDist, pace, altitude) {
  document.getElementById("pace-value").textContent = formatPace(pace);
  const km = Math.round(distAlongRoute / 100) / 10;
  const totalKm = Math.round(totalDist / 100) / 10;
  document.getElementById("distance-value").textContent = `${km} / ${totalKm} km`;
  document.getElementById("elevation-value").textContent =
    altitude != null ? `${Math.round(altitude)}m` : "--";
}

async function pollLive() {
  try {
    const live = await API.getLive(raceId);

    if (!live.current_location) {
      updateStaleness(null);
      return;
    }

    const loc = live.current_location;
    updateStaleness(loc.timestamp);

    const totalDist = routeData.route[routeData.route.length - 1].cumDist;
    const snap = snapToRoute(loc.lat, loc.lon, routeData.route, previousSnapIndex);
    previousSnapIndex = snap.segmentIndex;

    // Track maximum distance to detect finish and prevent snap-back
    if (snap.distAlongRoute > maxDistAlongRoute) {
      maxDistAlongRoute = snap.distAlongRoute;
    }

    if (maxDistAlongRoute >= totalDist * FINISH_THRESHOLD) {
      raceFinished = true;
    }

    // Use max distance if finished (prevents snap-back to start on loop routes)
    const effectiveDist = raceFinished ? totalDist : snap.distAlongRoute;

    if (snap.offRoute) {
      updateRunnerPosition(loc.lat, loc.lon, true, routeData.route, snap.segmentIndex);
    } else {
      updateRunnerPosition(snap.lat, snap.lon, false, routeData.route, snap.segmentIndex);
    }

    const badge = document.getElementById("off-route-badge");
    badge.classList.toggle("visible", snap.offRoute && !raceFinished);

    drawTrack(live.track);

    const pace = computePace(live.track, routeData.route, effectiveDist);
    const etas = computeETAs(routeData.aid_stations, effectiveDist, pace);
    renderAidStations(etas);

    updateStats(effectiveDist, totalDist, pace, loc.altitude);
    updatePrediction(live.track, effectiveDist, totalDist, pace);

    const canvas = document.getElementById("elevation-canvas");
    drawElevationProfile(canvas, routeData.route, effectiveDist);
  } catch (err) {
    console.error("Poll failed:", err);
    showError("Failed to fetch live data. Retrying...");
  }
}

async function init() {
  raceId = getRaceId();
  if (!raceId) {
    hideLoading();
    showError("No race ID provided. Add ?id=... to the URL.");
    return;
  }

  try {
    initMap();
    routeData = await API.getRoute(raceId);

    document.title = routeData.name + " — Tracker";
    drawRoute(routeData.route);
    drawAidStations(routeData.aid_stations);

    const canvas = document.getElementById("elevation-canvas");
    drawElevationProfile(canvas, routeData.route, 0);

    hideLoading();

    await pollLive();
    setInterval(pollLive, POLL_INTERVAL);
  } catch (err) {
    hideLoading();
    showError(`Failed to load race: ${err.message}`);
    console.error(err);
  }
}

document.getElementById("admin-toggle").addEventListener("click", () => {
  document.getElementById("admin-panel").classList.toggle("visible");
});

document.getElementById("reset-btn").addEventListener("click", async () => {
  const pw = document.getElementById("admin-pw").value.trim();
  if (!pw) return;

  const btn = document.getElementById("reset-btn");
  btn.disabled = true;
  btn.textContent = "Resetting...";

  try {
    await API.resetTrack(raceId, pw);
    previousSnapIndex = null;
    lastValidPace = null;
    raceFinished = false;
    maxDistAlongRoute = 0;
    clearTrack();
    updateRunnerPosition(null, null, false);
    document.getElementById("admin-panel").classList.remove("visible");
    document.getElementById("admin-pw").value = "";
    await pollLive();
  } catch (err) {
    alert("Reset failed: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Reset Track";
  }
});

document.getElementById("delete-btn").addEventListener("click", async () => {
  const pw = document.getElementById("admin-pw").value.trim();
  if (!pw) return;
  if (!confirm("Permanently delete this race? This cannot be undone.")) return;

  const btn = document.getElementById("delete-btn");
  btn.disabled = true;
  btn.textContent = "Deleting...";

  try {
    await API.deleteRace(raceId, pw);
    window.location.href = "index.html";
  } catch (err) {
    alert("Delete failed: " + err.message);
    btn.disabled = false;
    btn.textContent = "Delete Race";
  }
});

window.addEventListener("resize", () => {
  if (routeData) {
    const canvas = document.getElementById("elevation-canvas");
    drawElevationProfile(canvas, routeData.route, null);
  }
});

init();
