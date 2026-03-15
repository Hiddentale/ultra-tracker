const REFRESH_INTERVAL = 30000;

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / 60000);
  return mins > 0 ? `${mins}m ago` : "just now";
}

function renderRaces(races) {
  const list = document.getElementById("race-list");
  const empty = document.getElementById("empty-state");

  if (races.length === 0) {
    list.replaceChildren();
    empty.classList.add("visible");
    return;
  }

  empty.classList.remove("visible");
  list.replaceChildren();

  for (const race of races) {
    const btn = document.createElement("a");
    btn.href = `tracker.html?id=${encodeURIComponent(race.id)}`;
    btn.className = "race-btn";

    const name = document.createElement("span");
    name.className = "race-name";
    name.textContent = race.name;
    btn.appendChild(name);

    const meta = document.createElement("span");
    meta.className = "race-meta";
    const parts = [];
    if (race.total_distance_km) parts.push(`${race.total_distance_km} km`);
    if (race.created_at) parts.push(timeAgo(race.created_at));
    meta.textContent = parts.join(" · ");
    btn.appendChild(meta);

    list.appendChild(btn);
  }
}

async function loadRaces() {
  try {
    const races = await API.listRaces();
    renderRaces(races);
  } catch (err) {
    console.error("Failed to load races:", err);
    const list = document.getElementById("race-list");
    list.replaceChildren();
    const p = document.createElement("p");
    p.className = "loading-text";
    p.textContent = "Failed to load races";
    list.appendChild(p);
  }
}

loadRaces();
setInterval(loadRaces, REFRESH_INTERVAL);
