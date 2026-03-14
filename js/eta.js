const PACE_WINDOW_MS = 20 * 60 * 1000; // 20 minutes
const MIN_POINTS_FOR_ETA = 3;
const STATIONARY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const STATIONARY_DISTANCE = 50; // meters — consider stationary if moved less than this

function computePace(track, route, currentDistAlongRoute) {
  if (track.length < MIN_POINTS_FOR_ETA) return null;

  const now = new Date(track[track.length - 1].timestamp).getTime();
  const windowStart = now - PACE_WINDOW_MS;

  // Filter track points within the rolling window
  const windowPoints = track.filter(p =>
    new Date(p.timestamp).getTime() >= windowStart
  );

  if (windowPoints.length < MIN_POINTS_FOR_ETA) return null;

  // Snap first and last window points to route to get distance covered
  const first = windowPoints[0];
  const last = windowPoints[windowPoints.length - 1];
  const firstSnap = snapToRoute(first.lat, first.lon, route, null);
  const lastSnap = snapToRoute(last.lat, last.lon, route, firstSnap.segmentIndex);

  const distanceCovered = lastSnap.distAlongRoute - firstSnap.distAlongRoute;
  const timeCovered = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();

  if (distanceCovered <= 0 || timeCovered <= 0) return null;

  // Check if stationary (at an aid station, resting, etc.)
  const isStationary = distanceCovered < STATIONARY_DISTANCE
    && timeCovered > STATIONARY_THRESHOLD_MS;

  if (isStationary) {
    // Find pace from before the stop — look at points before the window
    const preStopPoints = track.filter(p =>
      new Date(p.timestamp).getTime() < windowStart
    );
    if (preStopPoints.length >= MIN_POINTS_FOR_ETA) {
      return computePaceFromPoints(preStopPoints.slice(-20), route);
    }
    return null;
  }

  // pace = ms per meter
  return timeCovered / distanceCovered;
}

function computePaceFromPoints(points, route) {
  const first = points[0];
  const last = points[points.length - 1];
  const firstSnap = snapToRoute(first.lat, first.lon, route, null);
  const lastSnap = snapToRoute(last.lat, last.lon, route, firstSnap.segmentIndex);
  const dist = lastSnap.distAlongRoute - firstSnap.distAlongRoute;
  const time = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();
  if (dist <= 0 || time <= 0) return null;
  return time / dist;
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
