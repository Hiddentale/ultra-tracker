let map = null;
let routeLayer = null;
let trackLayer = null;
let runnerMarker = null;
let aidMarkers = [];
let runnerBearing = 0;

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

function clearTrack() {
  if (trackLayer) {
    map.removeLayer(trackLayer);
    trackLayer = null;
  }
  if (runnerMarker) {
    map.removeLayer(runnerMarker);
    runnerMarker = null;
  }
}

function computeBearing(route, segmentIndex) {
  const a = route[segmentIndex];
  const b = route[Math.min(segmentIndex + 1, route.length - 1)];
  const toRad = x => x * Math.PI / 180;
  const toDeg = x => x * 180 / Math.PI;
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat))
    - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function makeArrowSvg(color) {
  return `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <polygon points="10,2 18,18 10,13 2,18" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

function updateRunnerPosition(lat, lon, offRoute, route, segmentIndex) {
  if (lat == null || lon == null) return;
  const color = offRoute ? "#f0c040" : "#e8622c";

  if (route && segmentIndex != null) {
    runnerBearing = computeBearing(route, segmentIndex);
  }

  const arrowHtml = `<div class="runner-arrow" style="transform: rotate(${runnerBearing}deg)">${makeArrowSvg(color)}</div>`;

  if (!runnerMarker) {
    const icon = L.divIcon({
      className: "runner-icon-wrapper",
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      html: arrowHtml,
    });
    runnerMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 }).addTo(map);
  } else {
    runnerMarker.setLatLng([lat, lon]);
    const el = runnerMarker.getElement();
    if (el) {
      const arrow = el.querySelector(".runner-arrow");
      if (arrow) {
        arrow.style.transform = `rotate(${runnerBearing}deg)`;
        arrow.innerHTML = makeArrowSvg(color);
      }
    }
  }
}
