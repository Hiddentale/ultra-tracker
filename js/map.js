let map = null;
let routeLayer = null;
let trackLayer = null;
let runnerMarker = null;
let aidMarkers = [];

function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  return map;
}

function drawRoute(route) {
  if (routeLayer) map.removeLayer(routeLayer);

  const latlngs = route.map(p => [p.lat, p.lon]);
  routeLayer = L.polyline(latlngs, {
    color: "#4a4d55",
    weight: 4,
    opacity: 0.8,
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
}

function drawAidStations(aidStations) {
  aidMarkers.forEach(m => map.removeLayer(m));
  aidMarkers = [];

  for (const station of aidStations) {
    const icon = L.divIcon({
      className: "aid-station-icon",
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    const marker = L.marker([station.lat, station.lon], { icon })
      .bindPopup(`<b>${station.name}</b><br>${station.distance_km} km`)
      .addTo(map);

    aidMarkers.push(marker);
  }
}

function drawTrack(track) {
  if (trackLayer) map.removeLayer(trackLayer);
  if (!track || track.length < 2) return;

  const latlngs = track.map(p => [p.lat, p.lon]);
  trackLayer = L.polyline(latlngs, {
    color: "#3ddc84",
    weight: 3,
    opacity: 0.85,
  }).addTo(map);
}

function updateRunnerPosition(lat, lon, offRoute) {
  const color = offRoute ? "#f0c040" : "#e8622c";

  if (!runnerMarker) {
    const icon = L.divIcon({
      className: "runner-icon",
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      html: "",
    });
    runnerMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 }).addTo(map);
  } else {
    runnerMarker.setLatLng([lat, lon]);
  }

  // Update icon color
  const el = runnerMarker.getElement();
  if (el) {
    el.style.background = color;
    el.style.borderRadius = "50%";
    el.style.border = "3px solid white";
    el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.4)";
  }
}
