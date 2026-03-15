const adminSecret = sessionStorage.getItem("admin_secret");
if (!adminSecret) {
  window.location.href = "admin.html";
}

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

  const label = document.getElementById("file-label");
  label.textContent = file.name;
  label.classList.add("has-file");

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
  routeLayer = L.polyline(latlngs, { color: "#e8622c", weight: 3 }).addTo(previewMap);
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
      <button class="btn btn-small btn-danger" data-remove="${i}">Remove</button>
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
  const name = document.getElementById("race-name").value.trim();
  if (!name) { alert("Enter a race name"); return; }
  if (!gpxString) { alert("Upload a GPX file"); return; }

  const btn = document.getElementById("create-btn");
  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    const result = await API.createRace(name, gpxString, aidStations, adminSecret);

    const resultEl = document.getElementById("result");

    const heading = document.createElement("h2");
    heading.textContent = "Race Created";
    resultEl.appendChild(heading);

    const idP = document.createElement("p");
    idP.innerHTML = "";
    const idStrong = document.createElement("strong");
    idStrong.textContent = "Race ID: ";
    idP.appendChild(idStrong);
    idP.appendChild(document.createTextNode(result.id));
    resultEl.appendChild(idP);

    const urlP = document.createElement("p");
    const urlStrong = document.createElement("strong");
    urlStrong.textContent = "Viewer URL: ";
    urlP.appendChild(urlStrong);
    const urlA = document.createElement("a");
    urlA.href = result.viewer_url;
    urlA.target = "_blank";
    urlA.textContent = result.viewer_url;
    urlP.appendChild(urlA);
    resultEl.appendChild(urlP);

    const tokenLabel = document.createElement("p");
    const tokenStrong = document.createElement("strong");
    tokenStrong.textContent = "Auth Token";
    tokenLabel.appendChild(tokenStrong);
    tokenLabel.appendChild(document.createTextNode(" (save this — shown only once):"));
    resultEl.appendChild(tokenLabel);

    const tokenDiv = document.createElement("div");
    tokenDiv.className = "token-display";
    tokenDiv.textContent = result.token;
    resultEl.appendChild(tokenDiv);

    const instrDiv = document.createElement("div");
    instrDiv.className = "instructions";
    resultEl.appendChild(instrDiv);

    const instrTitle = document.createElement("strong");
    instrTitle.textContent = "Overland App Configuration:";
    instrDiv.appendChild(instrTitle);

    const endpoint = `${WORKER_URL}/api/race/${result.id}/location`;
    const steps = [
      { text: "1. Install ", linkText: "Overland", linkHref: "https://apps.apple.com/app/overland-gps-tracker/id1292426766", suffix: " from the App Store" },
      { text: "2. Set receiver endpoint to: ", code: endpoint },
      { text: "3. Add HTTP header: ", code: `Authorization: Bearer ${result.token}` },
      { text: "4. Set tracking interval to ", bold: "30 seconds" },
      { text: "5. Set accuracy to ", bold: "High" },
      { text: "6. Turn ", bold: "OFF", suffix: " visit detection" },
    ];

    for (const step of steps) {
      instrDiv.appendChild(document.createElement("br"));
      instrDiv.appendChild(document.createTextNode(step.text));
      if (step.linkText) {
        const a = document.createElement("a");
        a.href = step.linkHref;
        a.target = "_blank";
        a.textContent = step.linkText;
        instrDiv.appendChild(a);
      }
      if (step.code) {
        const code = document.createElement("code");
        code.textContent = step.code;
        instrDiv.appendChild(code);
      }
      if (step.bold) {
        const b = document.createElement("strong");
        b.textContent = step.bold;
        instrDiv.appendChild(b);
      }
      if (step.suffix) {
        instrDiv.appendChild(document.createTextNode(step.suffix));
      }
    }

    resultEl.classList.add("visible");
    sessionStorage.removeItem("admin_secret");
  } catch (err) {
    alert("Failed to create race: " + err.message);
    btn.disabled = false;
    btn.textContent = "Create Race";
  }
});
