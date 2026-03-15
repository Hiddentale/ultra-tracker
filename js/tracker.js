const POLL_INTERVAL = 20000;

let raceId = null;
let routeData = null;
let previousSnapIndex = null;

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

  list.innerHTML = upcoming.map((s, i) => {
    const prefix = i === 0 ? "Next" : "Then";
    const etaStr = s.eta
      ? `ETA: ${s.eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Calculating...";
    const durStr = s.eta_duration_min != null
      ? formatDuration(s.eta_duration_min)
      : "";
    const distStr = s.remaining_km != null
      ? `${s.remaining_km} km away`
      : "";

    return `
      <div class="aid-station">
        <div class="aid-name">${prefix}: ${s.name}</div>
        <div class="aid-details">${distStr}${durStr ? " · " + durStr : ""}</div>
        <div class="aid-eta">${etaStr}</div>
      </div>`;
  }).join("");
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

    const snap = snapToRoute(loc.lat, loc.lon, routeData.route, previousSnapIndex);
    previousSnapIndex = snap.segmentIndex;

    if (snap.offRoute) {
      updateRunnerPosition(loc.lat, loc.lon, true);
    } else {
      updateRunnerPosition(snap.lat, snap.lon, false);
    }

    const badge = document.getElementById("off-route-badge");
    badge.classList.toggle("visible", snap.offRoute);

    drawTrack(live.track);

    const pace = computePace(live.track, routeData.route, snap.distAlongRoute);
    const etas = computeETAs(routeData.aid_stations, snap.distAlongRoute, pace);
    renderAidStations(etas);

    const totalDist = routeData.route[routeData.route.length - 1].cumDist;
    updateStats(snap.distAlongRoute, totalDist, pace, loc.altitude);

    const canvas = document.getElementById("elevation-canvas");
    drawElevationProfile(canvas, routeData.route, snap.distAlongRoute);
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

window.addEventListener("resize", () => {
  if (routeData) {
    const canvas = document.getElementById("elevation-canvas");
    drawElevationProfile(canvas, routeData.route, null);
  }
});

init();
