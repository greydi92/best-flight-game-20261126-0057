// SKYHARBOUR — storage: best flights, medals and settings, kept in
// localStorage under one key. One file, one job: persistence, nothing else.

const KEY = 'skyharbour-save-v1';

/** Load the save, or a fresh one when nothing is stored yet. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return freshSave();
    return {
      medals: parsed.medals || {},
      bestScores: parsed.bestScores || {},
      bestAircraft: parsed.bestAircraft || {},
      flights: parsed.flights || 0,
      totalScore: parsed.totalScore || 0,
      muted: parsed.muted || false,
      selectedAircraft: parsed.selectedAircraft || 'kestrel',
      cameraMode: parsed.cameraMode || 'chase',
    };
  } catch (err) {
    return freshSave();
  }
}

export function freshSave() {
  return {
    medals: {},
    bestScores: {},
    bestAircraft: {},
    flights: 0,
    totalScore: 0,
    muted: false,
    selectedAircraft: 'kestrel',
    cameraMode: 'chase',
  };
}

/** Write the save back to localStorage. */
export function saveSave(save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch (err) {
    // Storage may be unavailable (private mode); the game plays on regardless.
  }
}

const MEDAL_RANK = { none: 0, bronze: 1, silver: 2, gold: 3 };

/** Record a finished mission: best medal, best score, flight counts. */
export function recordMission(save, mission) {
  if (!mission.result) return save;
  const id = mission.id;
  const prev = save.medals[id] || 'none';
  if (MEDAL_RANK[mission.result.medal] > MEDAL_RANK[prev]) save.medals[id] = mission.result.medal;
  if (!save.bestScores[id] || mission.result.score > save.bestScores[id]) {
    save.bestScores[id] = mission.result.score;
  }
  const aircraft = mission.def.aircraft;
  if (!save.bestAircraft[aircraft] || mission.result.score > save.bestAircraft[aircraft]) {
    save.bestAircraft[aircraft] = mission.result.score;
  }
  save.flights += 1;
  save.totalScore += Math.max(0, mission.result.score);
  saveSave(save);
  return save;
}

/** One-line summary for the title screen. */
export function titleSummary(save) {
  if (!save.flights) return 'No flights logged yet — the valley is waiting.';
  const medals = Object.values(save.medals).filter((m) => m !== 'none').length;
  const golds = Object.values(save.medals).filter((m) => m === 'gold').length;
  return `${save.flights} flight${save.flights === 1 ? '' : 's'} logged · ${medals} medals (${golds} gold) · ${save.totalScore} total points`;
}
