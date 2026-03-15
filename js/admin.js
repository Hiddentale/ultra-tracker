let gpxString = null;
let routePoints = [];
let aidStations = [];
let previewMap = null;
let routeLayer = null;
let stationMarkers = [];

function parseGpxClient(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");
  const trkpts = doc.querySelectorAll("trkpt");
  const points = [];
  for (const pt of trkpts) {
    const lat = parseFloat(pt.getAttribute("lat"));
    const lon = parseFloat(pt.getAttribute("lon"));
    const eleEl = pt.querySelector("ele");
    const ele = eleEl ? parseFloat(eleEl.textContent) : null;
    points.push({ lat, lon, ele });
  }
  return points;
}

document.getElementById("gpx-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  gpxString = await file.text();
  routePoints = parseGpxClient(gpxString);

  document.getElementById("gpx-info").textContent =
    `${routePoints.length} trackpoints loaded`;

  if (routePoints.length < 2) {
    document.getElementById("gpx-info").textContent = "Error: GPX has fewer than 2 points";
    return;
  }

  const mapDiv = document.getElementById("map-preview");
  mapDiv.classList.add("visible");

  if (!previewMap) {
    previewMap = L.map("map-preview");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(previewMap);

    previewMap.on("click", onMapClick);
  }

  if (routeLayer) previewMap.removeLayer(routeLayer);
  const latlngs = routePoints.map(p => [p.lat, p.lon]);
  routeLayer = L.polyline(latlngs, { color: "#2563eb", weight: 3 }).addTo(previewMap);
  previewMap.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });

  document.getElementById("aid-section").classList.add("visible");
  document.getElementById("create-btn").disabled = false;
});

function onMapClick(e) {
  const name = prompt("Aid station name:");
  if (!name) return;

  const dist = estimateDistanceKm(e.latlng.lat, e.latlng.lng);
  addStation(name, e.latlng.lat, e.latlng.lng, dist);
}

function estimateDistanceKm(lat, lon) {
  let bestDist = Infinity;
  let bestIdx = 0;
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;

  for (let i = 0; i < routePoints.length; i++) {
    const p = routePoints[i];
    const dLat = toRad(p.lat - lat);
    const dLon = toRad(p.lon - lon);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(p.lat)) * Math.sin(dLon / 2) ** 2;
    const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }

  let cumDist = 0;
  for (let i = 1; i <= bestIdx; i++) {
    const a = routePoints[i - 1], b = routePoints[i];
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    cumDist += R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  return Math.round(cumDist / 100) / 10;
}

function addStationManual() {
  const name = document.getElementById("station-name").value.trim();
  const dist = parseFloat(document.getElementById("station-dist").value);
  if (!name || isNaN(dist)) return;
  addStation(name, null, null, dist);
  document.getElementById("station-name").value = "";
  document.getElementById("station-dist").value = "";
}

function createDraggableMarker(lat, lon, idx) {
  const marker = L.marker([lat, lon], {
    draggable: true,
    autoPan: true,
  }).bindPopup(aidStations[idx].name).addTo(previewMap);

  marker.on("dragend", () => {
    const pos = marker.getLatLng();
    aidStations[idx].lat = pos.lat;
    aidStations[idx].lon = pos.lng;
    aidStations[idx].distance_km = estimateDistanceKm(pos.lat, pos.lng);
    renderStationList();
  });

  return marker;
}

function addStation(name, lat, lon, distKm) {
  const idx = aidStations.length;
  aidStations.push({ name, lat, lon, distance_km: distKm });

  if (lat != null && previewMap) {
    stationMarkers.push(createDraggableMarker(lat, lon, idx));
  }

  renderStationList();
}

function rebuildMarkers() {
  stationMarkers.forEach(m => previewMap.removeLayer(m));
  stationMarkers = [];
  for (let i = 0; i < aidStations.length; i++) {
    const s = aidStations[i];
    if (s.lat != null && previewMap) {
      stationMarkers.push(createDraggableMarker(s.lat, s.lon, i));
    }
  }
}

function removeStation(idx) {
  aidStations.splice(idx, 1);
  rebuildMarkers();
  renderStationList();
}

function renderStationList() {
  const list = document.getElementById("station-list");
  list.innerHTML = aidStations.map((s, i) =>
    `<div class="station-item">
      <span>${s.name} — ${s.distance_km} km</span>
      <button data-remove="${i}">Remove</button>
    </div>`
  ).join("");
}

document.getElementById("station-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  removeStation(parseInt(btn.dataset.remove, 10));
});

document.getElementById("add-station-btn").addEventListener("click", addStationManual);

document.getElementById("create-btn").addEventListener("click", async () => {
  const adminSecret = document.getElementById("admin-secret").value.trim();
  if (!adminSecret) { alert("Enter admin password"); return; }
  const name = document.getElementById("race-name").value.trim();
  if (!name) { alert("Enter a race name"); return; }
  if (!gpxString) { alert("Upload a GPX file"); return; }

  const btn = document.getElementById("create-btn");
  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    const result = await API.createRace(name, gpxString, aidStations, adminSecret);

    document.getElementById("result-id").textContent = result.id;
    const urlEl = document.getElementById("result-url");
    urlEl.href = result.viewer_url;
    urlEl.textContent = result.viewer_url;
    document.getElementById("result-token").textContent = result.token;

    const instructionsEl = document.getElementById("overland-instructions");
    const endpoint = `${WORKER_URL}/api/race/${result.id}/location`;
    const token = result.token;
    instructionsEl.innerHTML = "";

    const title = document.createElement("strong");
    title.textContent = "Overland App Configuration:";
    instructionsEl.appendChild(title);

    const steps = [
      { text: "1. Install ", linkText: "Overland", linkHref: "https://apps.apple.com/app/overland-gps-tracker/id1292426766" },
      { text: `2. Set receiver endpoint to: `, code: endpoint },
      { text: `3. Add HTTP header: `, code: `Authorization: Bearer ${token}` },
      { text: "4. Set tracking interval to ", bold: "30 seconds" },
      { text: "5. Set accuracy to ", bold: "High" },
      { text: "6. Turn ", bold: "OFF", suffix: " visit detection" },
    ];

    for (const step of steps) {
      instructionsEl.appendChild(document.createElement("br"));
      const span = document.createTextNode(step.text);
      instructionsEl.appendChild(span);
      if (step.linkText) {
        const a = document.createElement("a");
        a.href = step.linkHref;
        a.target = "_blank";
        a.textContent = step.linkText;
        instructionsEl.appendChild(a);
        instructionsEl.appendChild(document.createTextNode(" from the App Store"));
      }
      if (step.code) {
        const code = document.createElement("code");
        code.textContent = step.code;
        instructionsEl.appendChild(code);
      }
      if (step.bold) {
        const b = document.createElement("strong");
        b.textContent = step.bold;
        instructionsEl.appendChild(b);
      }
      if (step.suffix) {
        instructionsEl.appendChild(document.createTextNode(step.suffix));
      }
    }

    document.getElementById("result").classList.add("visible");
  } catch (err) {
    alert("Failed to create race: " + err.message);
    btn.disabled = false;
    btn.textContent = "Create Race";
  }
});
