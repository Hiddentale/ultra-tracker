const PACE_WINDOW_MS = 20 * 60 * 1000; // 20 minutes
const MIN_POINTS_FOR_ETA = 3;
const MIN_DISTANCE_FOR_PACE = 20; // meters — need at least this much movement to update pace

let lastValidPace = null;

function computePace(track, route, currentDistAlongRoute) {
  if (track.length < MIN_POINTS_FOR_ETA) return lastValidPace;

  const now = new Date(track[track.length - 1].timestamp).getTime();
  const windowStart = now - PACE_WINDOW_MS;

  const windowPoints = track.filter(p =>
    new Date(p.timestamp).getTime() >= windowStart
  );

  if (windowPoints.length < MIN_POINTS_FOR_ETA) return lastValidPace;

  const first = windowPoints[0];
  const last = windowPoints[windowPoints.length - 1];
  const firstSnap = snapToRoute(first.lat, first.lon, route, null);
  const lastSnap = snapToRoute(last.lat, last.lon, route, firstSnap.segmentIndex);

  const distanceCovered = lastSnap.distAlongRoute - firstSnap.distAlongRoute;
  const timeCovered = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();

  if (distanceCovered < MIN_DISTANCE_FOR_PACE || timeCovered <= 0) {
    return lastValidPace;
  }

  // pace = ms per meter
  const pace = timeCovered / distanceCovered;
  lastValidPace = pace;
  return pace;
}

function computeETAs(aidStations, currentDistAlongRoute, pace) {
  if (!pace) {
    return aidStations.map(s => ({ ...s, eta: null, remaining: null }));
  }

  const now = Date.now();

  return aidStations.map(station => {
    const stationDist = station.distance_km * 1000;
    const remaining = stationDist - currentDistAlongRoute;

    if (remaining <= 0) {
      return { ...station, eta: null, remaining: null, passed: true };
    }

    const etaMs = remaining * pace;
    const etaTime = new Date(now + etaMs);

    return {
      ...station,
      remaining_km: Math.round(remaining / 100) / 10,
      eta: etaTime,
      eta_duration_min: Math.round(etaMs / 60000),
      passed: false,
    };
  });
}

function formatDuration(minutes) {
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

function formatPace(msPerMeter) {
  if (!msPerMeter) return "--";
  const minPerKm = msPerMeter * 1000 / 60000;
  const min = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}
