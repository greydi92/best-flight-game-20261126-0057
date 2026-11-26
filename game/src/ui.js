// SKYHARBOUR — UI: title screen, hangar, mission board, briefing, pause,
// debrief and help. One file, one job: the DOM screens around the game.
// The 3D scene keeps rendering behind them so the valley is always visible.

import { AIRCRAFT, MISSIONS, WEATHER } from './config.js';
import { fmtTime } from './utils.js';

/** Build all screens inside `root`. Returns handles the main loop wires up. */
export function createUi(root, callbacks) {
  root.innerHTML = `
  <div id="screen-title" class="screen">
    <div class="title-card">
      <div class="title-kicker">SKYHARBOUR VALLEY · EST. 1952</div>
      <h1>SKYHARBOUR</h1>
      <p class="title-sub">7 missions · 6 aircraft · 8 airfields · 12-ring courses · 4 weathers</p>
      <p class="title-desc">Fly the valley mail routes, thread the rings, rescue a hiker from the North Pass
      and bring the Grand Tour home. Throttle discipline wins medals. Fuel and damage turn every sortie into decisions.</p>
      <div class="title-buttons">
        <button id="btn-fly" class="btn primary">FLY NOW</button>
        <button id="btn-hangar" class="btn">HANGAR</button>
        <button id="btn-missions" class="btn">MISSIONS</button>
        <button id="btn-help" class="btn">HOW TO FLY</button>
      </div>
      <p class="title-foot">Keyboard + mouse · W/S or Shift/Ctrl throttle · Arrows or A/D pitch &amp; roll · C camera · P pause</p>
      <p class="title-foot dim" id="title-best">No flights logged yet — the valley is waiting.</p>
    </div>
  </div>
  <div id="screen-hangar" class="screen hidden">
    <div class="panel">
      <h2>HANGAR — CHOOSE YOUR AIRCRAFT</h2>
      <div id="hangar-list" class="hangar-list"></div>
      <div class="panel-buttons"><button id="btn-hangar-back" class="btn primary">BACK</button></div>
    </div>
  </div>
  <div id="screen-missions" class="screen hidden">
    <div class="panel wide">
      <h2>MISSION BOARD — SEVEN SORTIES</h2>
      <div id="mission-list" class="mission-list"></div>
      <div class="panel-buttons">
        <button id="btn-free" class="btn">FREE FLIGHT</button>
        <button id="btn-missions-back" class="btn primary">BACK</button>
      </div>
    </div>
  </div>
  <div id="screen-briefing" class="screen hidden">
    <div class="panel">
      <h2 id="brief-name">MISSION</h2>
      <p id="brief-text" class="brief-text"></p>
      <div id="brief-facts" class="brief-facts"></div>
      <h3>PILOT'S TIPS</h3>
      <ul id="brief-tips" class="brief-tips"></ul>
      <div class="panel-buttons">
        <button id="btn-brief-fly" class="btn primary">START ENGINE</button>
        <button id="btn-brief-back" class="btn">BACK</button>
      </div>
    </div>
  </div>
  <div id="screen-pause" class="screen hidden">
    <div class="panel small">
      <h2>PAUSED</h2>
      <p class="brief-text">The valley waits. Your fuel does not burn while paused.</p>
      <div class="panel-buttons">
        <button id="btn-resume" class="btn primary">RESUME</button>
        <button id="btn-quit" class="btn">QUIT TO TITLE</button>
        <button id="btn-restart" class="btn">RESTART MISSION</button>
      </div>
    </div>
  </div>
  <div id="screen-debrief" class="screen hidden">
    <div class="panel">
      <h2 id="debrief-title">SORTIE COMPLETE</h2>
      <div id="debrief-medal" class="medal"></div>
      <p id="debrief-note" class="brief-text"></p>
      <div id="debrief-stats" class="debrief-stats"></div>
      <div class="panel-buttons">
        <button id="btn-again" class="btn primary">FLY AGAIN</button>
        <button id="btn-debrief-missions" class="btn">MISSION BOARD</button>
        <button id="btn-debrief-title" class="btn">TITLE</button>
      </div>
    </div>
  </div>
  <div id="screen-help" class="screen hidden">
    <div class="panel wide">
      <h2>HOW TO FLY</h2>
      <div class="help-grid">
        <div><h3>THROTTLE</h3><p><b>Shift / W</b> more power · <b>Ctrl / S</b> less. Full throttle burns fuel fast and overheats nothing — but the tank is the limit.</p></div>
        <div><h3>PITCH &amp; ROLL</h3><p><b>↑ / ↓</b> or <b>J / K</b> pitch · <b>← / →</b> or <b>A / D</b> roll. Bank to turn — the heading follows the bank angle. <b>Q / E</b> rudder.</p></div>
        <div><h3>MOUSE</h3><p>Click the scene to steer with the mouse: pointer left/right rolls, up/down pitches. Right-drag looks around. <b>C</b> changes camera.</p></div>
        <div><h3>FLAPS &amp; GEAR</h3><p><b>F</b> flaps (0-1-2) — slower landings, more drag. <b>G</b> gear up/down — never land gear-up on a runway. <b>B</b> brakes.</p></div>
        <div><h3>LANDINGS</h3><p>Approach at 120 km/h, flare at 10 m, touch down under -2.2 m/s for a perfect landing. Hard arrivals damage the aircraft.</p></div>
        <div><h3>STALLS</h3><p>Below stall speed the wing quits and the nose drops. Push forward, add power, recover — never pull up in a stall.</p></div>
        <div><h3>OTHER KEYS</h3><p><b>P</b> pause · <b>R</b> reset to the field · <b>M</b> mute · <b>H</b> this help · <b>V</b> camera too.</p></div>
        <div><h3>SCORING</h3><p>Medals by par time: gold at par, silver at 1.25×, bronze at 1.6×. Perfect landings pay +250, fuel left pays +2/kg, damage costs -12/point.</p></div>
      </div>
      <div class="panel-buttons"><button id="btn-help-back" class="btn primary">BACK</button></div>
    </div>
  </div>`;
  const $ = (id) => root.querySelector(`#${id}`);
  const ui = {
    root,
    screens: {
      title: $('screen-title'), hangar: $('screen-hangar'), missions: $('screen-missions'),
      briefing: $('screen-briefing'), pause: $('screen-pause'), debrief: $('screen-debrief'), help: $('screen-help'),
    },
    titleBest: $('title-best'),
    hangarList: $('hangar-list'),
    missionList: $('mission-list'),
    briefName: $('brief-name'), briefText: $('brief-text'), briefFacts: $('brief-facts'), briefTips: $('brief-tips'),
    debriefTitle: $('debrief-title'), debriefMedal: $('debrief-medal'), debriefNote: $('debrief-note'), debriefStats: $('debrief-stats'),
  };
  const show = (name) => {
    for (const key of Object.keys(ui.screens)) {
      ui.screens[key].classList.toggle('hidden', key !== name);
    }
  };
  ui.show = show;
  ui.hideAll = () => {
    for (const key of Object.keys(ui.screens)) ui.screens[key].classList.add('hidden');
  };
  $('btn-fly').addEventListener('click', () => callbacks.onFly());
  $('btn-hangar').addEventListener('click', () => { renderHangar(ui, callbacks); show('hangar'); });
  $('btn-missions').addEventListener('click', () => { renderMissions(ui, callbacks); show('missions'); });
  $('btn-help').addEventListener('click', () => show('help'));
  $('btn-hangar-back').addEventListener('click', () => show('title'));
  $('btn-missions-back').addEventListener('click', () => show('title'));
  $('btn-free').addEventListener('click', () => callbacks.onFreeFlight());
  $('btn-brief-fly').addEventListener('click', () => callbacks.onStartMission());
  $('btn-brief-back').addEventListener('click', () => { renderMissions(ui, callbacks); show('missions'); });
  $('btn-resume').addEventListener('click', () => callbacks.onResume());
  $('btn-quit').addEventListener('click', () => callbacks.onQuitToTitle());
  $('btn-restart').addEventListener('click', () => callbacks.onRestart());
  $('btn-again').addEventListener('click', () => callbacks.onRestart());
  $('btn-debrief-missions').addEventListener('click', () => { renderMissions(ui, callbacks); show('missions'); });
  $('btn-debrief-title').addEventListener('click', () => callbacks.onQuitToTitle());
  $('btn-help-back').addEventListener('click', () => show('title'));
  renderHangar(ui, callbacks);
  renderMissions(ui, callbacks);
  return ui;
}

/** Render the hangar aircraft cards. */
export function renderHangar(ui, callbacks) {
  const best = callbacks.getBest ? callbacks.getBest() : {};
  ui.hangarList.innerHTML = AIRCRAFT.map((a) => {
    const selected = callbacks.selectedAircraft === a.id;
    return `<div class="card ${selected ? 'selected' : ''}" data-aircraft="${a.id}">
      <div class="card-title">${a.name}</div>
      <div class="card-role">${a.role}</div>
      <p class="card-blurb">${a.blurb}</p>
      <div class="card-stats">
        <span>Top ${a.maxSpeedKmh} km/h</span><span>Cruise ${a.cruiseKmh}</span>
        <span>Fuel ${a.fuelKg} kg</span><span>Stall ${a.stallKmh} km/h</span>
      </div>
      <div class="card-best">${best[a.id] ? `Best in this aircraft: ${best[a.id]}` : 'Not flown yet'}</div>
    </div>`;
  }).join('');
  ui.hangarList.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => {
      callbacks.onSelectAircraft(card.dataset.aircraft);
      renderHangar(ui, callbacks);
    });
  });
}

/** Render the mission board with medals earned so far. */
export function renderMissions(ui, callbacks) {
  const medals = callbacks.getMedals ? callbacks.getMedals() : {};
  ui.missionList.innerHTML = MISSIONS.map((m) => {
    const medal = medals[m.id] || '—';
    const weather = WEATHER[m.weather];
    return `<div class="card mission" data-mission="${m.id}">
      <div class="card-title">${m.name} <span class="medal-tag ${medal}">${medal === '—' ? 'NOT FLOWN' : medal.toUpperCase()}</span></div>
      <p class="card-blurb">${m.brief}</p>
      <div class="card-stats">
        <span>Par ${fmtTime(m.par)}</span><span>Reward ${m.reward} pts</span>
        <span>${weather.label}</span><span>Aircraft: ${m.aircraft}</span>
      </div>
    </div>`;
  }).join('');
  ui.missionList.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => callbacks.onSelectMission(card.dataset.mission));
  });
}

/** Fill the briefing screen for a mission. */
export function showBriefing(ui, mission) {
  const def = mission.def;
  ui.briefName.textContent = `${def.name} — BRIEFING`;
  ui.briefText.textContent = def.brief;
  const weather = WEATHER[def.weather];
  ui.briefFacts.innerHTML = `
    <span><b>Aircraft</b> ${def.aircraft}</span>
    <span><b>Depart</b> ${def.from}</span>
    <span><b>Par time</b> ${fmtTime(def.par)}</span>
    <span><b>Reward</b> ${def.reward} pts</span>
    <span><b>Weather</b> ${weather.label} · wind ${weather.windSpeed} m/s</span>
    <span><b>Time</b> ${def.timeOfDay}:00</span>`;
  ui.briefTips.innerHTML = (def.tips || []).map((t) => `<li>${t}</li>`).join('');
  ui.show('briefing');
}

/** Fill the debrief screen from a finished mission. */
export function showDebrief(ui, mission) {
  const r = mission.result;
  const ok = mission.state === 'complete';
  ui.debriefTitle.textContent = ok ? `${mission.name} — COMPLETE` : `${mission.name} — SORTIE FAILED`;
  const medalWords = { gold: '🥇 GOLD', silver: '🥈 SILVER', bronze: '🥉 BRONZE', none: 'NO MEDAL' };
  ui.debriefMedal.innerHTML = `<span class="medal-big ${r.medal}">${medalWords[r.medal] || 'NO MEDAL'}</span><span class="medal-score">${r.score} pts</span>`;
  ui.debriefNote.textContent = r.note;
  const rows = [
    ['Time', `${fmtTime(r.time)} (par ${fmtTime(r.par)})`],
    ['Landing', `${r.landingScore} pts`],
    ['Fuel bonus', `+${r.fuelBonus} pts (${r.fuelLeft} kg left)`],
    ['Time bonus', `+${r.timeBonus} pts`],
    ['Damage penalty', `-${r.damagePenalty} pts`],
    ['Rings', `${r.ringsPassed} passed · ${r.ringsMissed} missed`],
    ['Stops', `${r.stopsDone} landed`],
    ['Max altitude', `${r.maxAltitude} m`],
    ['Max speed', `${r.maxSpeed} km/h`],
    ['Distance', `${r.distanceKm} km`],
    ['Damage', `${r.damage}%`],
  ];
  ui.debriefStats.innerHTML = rows.map(([k, v]) => `<div class="stat-row"><span>${k}</span><b>${v}</b></div>`).join('');
  ui.show('debrief');
}

/** Update the title screen's best-flights line. */
export function updateTitleBest(ui, text) {
  if (ui.titleBest) ui.titleBest.textContent = text;
}
