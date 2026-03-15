// Worker URL — change this to your deployed Worker domain
const WORKER_URL = "https://ultra-tracker.expeditionorion.workers.dev";

const API = {
  async listRaces() {
    const res = await fetch(`${WORKER_URL}/api/races`);
    if (!res.ok) throw new Error(`Failed to list races: ${res.status}`);
    const data = await res.json();
    return data.races;
  },

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

  async resetTrack(raceId, adminSecret) {
    const res = await fetch(`${WORKER_URL}/api/race/${raceId}/reset`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminSecret}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to reset: ${res.status}`);
    }
    return res.json();
  },

  async deleteRace(raceId, adminSecret) {
    const res = await fetch(`${WORKER_URL}/api/race/${raceId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${adminSecret}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to delete: ${res.status}`);
    }
    return res.json();
  },

  async createRace(name, gpx, aidStations, adminSecret) {
    const res = await fetch(`${WORKER_URL}/api/race`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminSecret}`,
      },
      body: JSON.stringify({ name, gpx, aid_stations: aidStations }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to create race: ${res.status}`);
    }
    return res.json();
  },
};
