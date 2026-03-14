// Worker URL — change this to your deployed Worker domain
const WORKER_URL = "https://ultra-tracker.expeditionorion.workers.dev";

const API = {
  async getRoute(raceId) {
    const res = await fetch(`${WORKER_URL}/api/race/${raceId}/route`);
    if (!res.ok) throw new Error(`Failed to fetch route: ${res.status}`);
    return res.json();
  },

  async getLive(raceId) {
    const res = await fetch(`${WORKER_URL}/api/race/${raceId}/live`);
    if (!res.ok) throw new Error(`Failed to fetch live data: ${res.status}`);
    return res.json();
  },

  async createRace(name, gpx, aidStations) {
    const res = await fetch(`${WORKER_URL}/api/race`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gpx, aid_stations: aidStations }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to create race: ${res.status}`);
    }
    return res.json();
  },
};
