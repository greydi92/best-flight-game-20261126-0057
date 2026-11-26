// SKYHARBOUR — main: the game itself. Boots the renderer, owns the loop,
// wires input, audio, HUD, UI, missions and cameras together, and handles
// the ?shot= screenshot scenes. One file, one job: orchestration.

import * as THREE from '../vendor/three.module.min.js';
import { WORLD, AIRCRAFT, aircraftById, airfieldById, missionById } from './config.js';
import { clamp, degToRad, fmtTime } from './utils.js';
import { createInput, attachInput, pollInput } from './input.js';
import { createAudio, unlockAudio, updateEngineAudio, ringChime, touchdownThump, crashNoise, stallBeep, uiClick, missionFanfare, startTheme, stopTheme, toggleMute } from './audio.js';
import { buildTerrain, groundHeight, animateTerrain } from './terrain.js';
import { buildAircraft, animateAircraft, setCockpitView } from './aircraft.js';
import { createFlightState, stepFlight, updateWind, nearestAirfield } from './physics.js';
import { createSky, updateSky } from './weather.js';
import { createEffects, setRingCourse, passRing, animateRings, spawnDust, spawnSmoke, spawnCrash, updateEffects, clearEffects, startContrail, updateContrail } from './effects.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createMission, createFreeFlight, startMission, updateMission } from './missions.js';
import { createCameraRig, updateCamera, nextCameraMode, snapCamera, addShake, setChaseScale } from './camera.js';
import { createHud, updateHud, toast, centreMessage } from './hud.js';
import { createUi, showBriefing, showDebrief, updateTitleBest } from './ui.js';
import { loadSave, saveSave, recordMission, titleSummary } from './storage.js';
import { stageShot, shotFromUrl } from './shots.js';

const $ = (id) => document.getElementById(id);

// Test hook: the play-test harness reads window.__skyharbour for state and
// any errors the page hit, without touching the game.
window.__skyharbour = { ready: false, shotReady: false, errors: [], state: 'boot' };
window.__skyharbour.debug = () => ({
  screen: game.screen,
  elapsed: game.elapsed,
  cameraMode: game.cameraRig.mode,
  cameraPos: game.camera.position.toArray().map((v) => +v.toFixed(1)),
  canopyVisible: game.aircraft?.getObjectByName('canopy')?.visible,
  propDiscOpacity: game.aircraft?.getObjectByName('propeller')?.getObjectByName('propDisc')?.material.opacity,
  flight: game.flight && {
    x: Math.round(game.flight.x), y: Math.round(game.flight.y), z: Math.round(game.flight.z),
    heading: Math.round(game.flight.heading), pitch: +game.flight.pitch.toFixed(1),
    roll: +game.flight.roll.toFixed(1), speed: Math.round(game.flight.airspeedKmh),
    fuel: Math.round(game.flight.fuelKg), damage: Math.round(game.flight.damage),
    onGround: game.flight.onGround, crashed: game.flight.crashed,
  },
  mission: game.mission && {
    id: game.mission.id, state: game.mission.state, elapsed: +game.mission.elapsed.toFixed(1),
    ringIndex: game.mission.ringIndex, ringsPassed: game.mission.ringsPassed,
    ringsMissed: game.mission.ringsMissed, score: game.mission.score,
    objective: game.mission.objective,
  },
  traffic: game.traffic && {
    planes: game.traffic.planes.map((p) => ({
      x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z),
      heading: Math.round(p.heading),
    })),
    gliders: game.traffic.gliders.length,
    flocks: game.traffic.flocks.length,
  },
  audio: game.audio && {
    unlocked: game.audio.unlocked,
    ctxState: game.audio.ctx ? game.audio.ctx.state : null,
    engineGain: game.audio.engineGain ? +game.audio.engineGain.gain.value.toFixed(3) : null,
  },
});
window.addEventListener('error', (event) => {
  window.__skyharbour.errors.push(String(event.message || event.error || 'unknown error'));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__skyharbour.errors.push(`rejection: ${String(event.reason || 'unknown')}`);
});

const game = {
  renderer: null,
  scene: null,
  camera: null,
  cameraRig: null,
  terrain: null,
  sky: null,
  effects: null,
  traffic: null,
  aircraft: null,
  aircraftSpec: null,
  flight: null,
  mission: null,
  pendingMissionId: null,
  input: createInput(),
  audio: createAudio(),
  hud: null,
  ui: null,
  save: loadSave(),
  elapsed: 0,
  lastFrame: 0,
  paused: false,
  screen: 'title', // title | flying | paused | debrief
  shotMode: null,
  debriefTimer: null,
  lastStallBeep: 0,
  dustTimer: 0,
  smokeTimer: 0,
  networkRequests: 0,
};

function boot() {
  const canvas = $('scene');
  game.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  game.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  game.renderer.setSize(window.innerWidth, window.innerHeight);
  game.renderer.outputColorSpace = THREE.SRGBColorSpace;
  game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  game.renderer.toneMappingExposure = 1.05;

  game.scene = new THREE.Scene();
  game.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 20000);
  game.cameraRig = createCameraRig(game.camera);

  game.terrain = buildTerrain(game.scene);
  game.sky = createSky(game.scene);
  game.effects = createEffects(game.scene);
  game.traffic = createTraffic(game.scene);
  startContrail(game.effects);

  game.hud = createHud($('hud-root'));
  game.ui = createUi($('ui-root'), {
    selectedAircraft: game.save.selectedAircraft,
    getBest: () => game.save.bestAircraft,
    getMedals: () => game.save.medals,
    onFly: () => startSelectedMission(),
    onFreeFlight: () => startFreeFlight(),
    onSelectAircraft: (id) => selectAircraft(id),
    onSelectMission: (id) => selectMission(id),
    onStartMission: () => beginMission(),
    onResume: () => resumeGame(),
    onQuitToTitle: () => quitToTitle(),
    onRestart: () => restartMission(),
  });

  attachInput(game.input, onAction);
  window.addEventListener('resize', onResize);
  window.addEventListener('pointerdown', () => unlockAudio(game.audio), { once: true });
  window.addEventListener('keydown', () => unlockAudio(game.audio), { once: true });

  // Park the default aircraft at Harbour Field behind the title screen.
  selectAircraft(game.save.selectedAircraft, true);
  resetFlight(airfieldById('harbour'), game.aircraftSpec, 'calm', 10);
  game.cameraRig.mode = 'cinematic';
  updateTitleBest(game.ui, titleSummary(game.save));

  // Screenshot mode: stage the scene, render one frame, stop the loop.
  const shot = shotFromUrl();
  if (shot) {
    game.shotMode = shot.name;
    try {
      const info = stageShot(shot.name, game);
      game.screen = 'flying';
      game.ui.hideAll();
      $('hud-root').style.display = 'block';
      // Snap the camera to the aircraft and let the smoothing settle, so
      // the frame is taken from the real chase/cockpit position, not from
      // wherever the camera happened to be when the scene was staged.
      snapCamera(game.cameraRig, game.flight);
      for (let i = 0; i < 40; i += 1) renderFrame(1 / 60);
      updateHud(game.hud, game.flight, game.mission, 1 / 60);
      document.title = `SKYHARBOUR — ${info.caption}`;
      window.__skyharbour.shotReady = true;
      window.__skyharbour.state = 'shot';
    } catch (err) {
      window.__skyharbour.errors.push(`shot: ${String(err && err.message ? err.message : err)}`);
    }
    window.__skyharbour.ready = true;
    return;
  }

  startTheme(game.audio);
  game.lastFrame = performance.now();
  window.__skyharbour.ready = true;
  window.__skyharbour.state = 'title';
  requestAnimationFrame(frame);
}

function onResize() {
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
}

function onAction(action) {
  if (action === 'pause') {
    if (game.screen === 'flying') pauseGame();
    else if (game.screen === 'paused') resumeGame();
    return;
  }
  if (game.screen !== 'flying') return;
  if (action === 'camera') {
    const mode = nextCameraMode(game.cameraRig);
    toast(game.hud, `Camera: ${mode}`);
    game.save.cameraMode = mode;
    saveSave(game.save);
  } else if (action === 'flaps') {
    game.flight.flaps = (game.flight.flaps + 1) % 3;
    toast(game.hud, `Flaps ${game.flight.flaps}`);
  } else if (action === 'gear') {
    if (game.flight.onGround && game.flight.airspeedKmh < 40) {
      toast(game.hud, 'Gear stays down on the ground');
      return;
    }
    game.flight.gearDown = !game.flight.gearDown;
    toast(game.hud, game.flight.gearDown ? 'Gear down' : 'Gear up');
  } else if (action === 'reset') {
    restartMission();
  } else if (action === 'mute') {
    const muted = toggleMute(game.audio);
    game.save.muted = muted;
    saveSave(game.save);
    toast(game.hud, muted ? 'Sound off' : 'Sound on');
  } else if (action === 'help') {
    pauseGame();
    game.ui.show('help');
  }
}

/** Pick an aircraft for the hangar and the next flight. */
function selectAircraft(id, silent) {
  game.aircraftSpec = aircraftById(id);
  game.save.selectedAircraft = id;
  saveSave(game.save);
  if (game.aircraft) game.scene.remove(game.aircraft);
  game.aircraft = buildAircraft(game.aircraftSpec);
  game.scene.add(game.aircraft);
  if (!silent) uiClick(game.audio);
}

/** Open the briefing for a mission. */
function selectMission(id) {
  const mission = createMission(id);
  game.pendingMissionId = id;
  game.mission = mission;
  showBriefing(game.ui, mission);
  uiClick(game.audio);
}

/** Start the mission currently selected on the board (defaults to First Solo). */
function startSelectedMission() {
  const id = game.pendingMissionId || 'first-solo';
  selectMission(id);
}

/** Begin the pending mission: place the aircraft, start the clock. */
function beginMission() {
  const mission = game.mission || createMission('first-solo');
  const def = mission.def;
  const spec = aircraftById(def.aircraft);
  selectAircraft(spec.id, true);
  const field = airfieldById(def.from);
  resetFlight(field, spec, def.weather, def.timeOfDay);
  if (mission.kind === 'rings') {
    setRingCourse(game.effects, mission.rings, 0);
  } else {
    clearEffects(game.effects);
    startContrail(game.effects);
  }
  startMission(mission, game.elapsed);
  stopTheme(game.audio);
  unlockAudio(game.audio);
  game.screen = 'flying';
  game.ui.hideAll();
  $('hud-root').style.display = 'block';
  snapCamera(game.cameraRig, game.flight);
  game.cameraRig.mode = game.save.cameraMode || 'chase';
  toast(game.hud, `${mission.name} — ${mission.objective}`);
  window.__skyharbour.state = 'flying';
}

/** Free flight from Harbour Field in the selected aircraft. */
function startFreeFlight() {
  const mission = createFreeFlight();
  mission.def.aircraft = game.aircraftSpec.id;
  game.mission = mission;
  game.pendingMissionId = null;
  const field = airfieldById('harbour');
  resetFlight(field, game.aircraftSpec, 'calm', 12);
  clearEffects(game.effects);
  startContrail(game.effects);
  mission.startedAt = game.elapsed;
  stopTheme(game.audio);
  unlockAudio(game.audio);
  game.screen = 'flying';
  game.ui.hideAll();
  $('hud-root').style.display = 'block';
  snapCamera(game.cameraRig, game.flight);
  game.cameraRig.mode = game.save.cameraMode || 'chase';
  toast(game.hud, 'Free flight — explore the valley');
  window.__skyharbour.state = 'flying';
}

/** Used by shots.js: start a mission by id without the briefing screen. */
game.startMissionById = function startMissionById(id) {
  const mission = createMission(id);
  game.mission = mission;
  game.pendingMissionId = id;
  const def = mission.def;
  const spec = aircraftById(def.aircraft);
  selectAircraft(spec.id, true);
  const field = airfieldById(def.from);
  resetFlight(field, spec, def.weather, def.timeOfDay);
  if (mission.kind === 'rings') setRingCourse(game.effects, mission.rings, 0);
  startMission(mission, game.elapsed);
  game.screen = 'flying';
  game.ui.hideAll();
  $('hud-root').style.display = 'block';
  return mission;
};

/** Used by shots.js: set the camera mode directly. */
game.setCameraMode = function setCameraMode(mode) {
  game.cameraRig.mode = mode;
};

/** Used by shots.js: widen the chase framing for the landing final. */
game.setChaseScale = function (scale) {
  setChaseScale(game.cameraRig, scale);
};

/** (Re)create the flight state at a field. */
function resetFlight(field, spec, weatherKey, timeOfDay) {
  game.flight = createFlightState(spec, field, weatherKey, timeOfDay);
  game.flight.gearDown = true;
  game.input.throttle = 0;
  if (game.aircraft) {
    game.aircraft.position.set(game.flight.x, game.flight.y, game.flight.z);
    game.aircraft.rotation.set(0, -degToRad(game.flight.heading), 0);
  }
  snapCamera(game.cameraRig, game.flight);
}

function pauseGame() {
  if (game.screen !== 'flying') return;
  game.paused = true;
  game.screen = 'paused';
  game.ui.show('pause');
  window.__skyharbour.state = 'paused';
}

function resumeGame() {
  game.paused = false;
  game.screen = 'flying';
  game.ui.hideAll();
  game.lastFrame = performance.now();
  window.__skyharbour.state = 'flying';
}

function quitToTitle() {
  game.paused = false;
  game.screen = 'title';
  game.mission = null;
  game.pendingMissionId = null;
  clearEffects(game.effects);
  startContrail(game.effects);
  selectAircraft(game.save.selectedAircraft, true);
  resetFlight(airfieldById('harbour'), game.aircraftSpec, 'calm', 10);
  game.cameraRig.mode = 'cinematic';
  $('hud-root').style.display = 'none';
  game.ui.show('title');
  updateTitleBest(game.ui, titleSummary(game.save));
  startTheme(game.audio);
  window.__skyharbour.state = 'title';
}

function restartMission() {
  if (game.debriefTimer) window.clearTimeout(game.debriefTimer);
  if (game.pendingMissionId) {
    const id = game.pendingMissionId;
    const mission = createMission(id);
    game.mission = mission;
    beginMission();
  } else if (game.mission && game.mission.kind === 'free') {
    startFreeFlight();
  } else {
    beginMission();
  }
}

/** Handle one flight event: sounds, effects, toasts. */
function handleFlightEvent(event) {
  const flight = game.flight;
  if (event.type === 'touchdown') {
    const hardness = clamp(-event.vs / 10, 0, 1);
    touchdownThump(game.audio, hardness);
    addShake(game.cameraRig, 0.15 + hardness * 0.4);
    if (!event.water) spawnDust(game.effects, flight.x, flight.y - 1, flight.z, 14);
    if (flight.lastLanding) {
      toast(game.hud, flight.lastLanding.label);
      if (flight.lastLanding.quality === 'perfect') centreMessage(game.hud, 'PERFECT LANDING', flight.lastLanding.label);
    }
  } else if (event.type === 'takeoff') {
    toast(game.hud, 'Airborne!');
    centreMessage(game.hud, 'AIRBORNE', 'Gear up when clear — G');
  } else if (event.type === 'stall') {
    stallBeep(game.audio);
    toast(game.hud, 'STALL! Push the nose down');
  } else if (event.type === 'hard-landing') {
    toast(game.hud, `Hard landing — ${event.damage}% damage`);
    addShake(game.cameraRig, 0.5);
  } else if (event.type === 'scrape') {
    toast(game.hud, `Terrain scrape — ${event.damage}% damage`);
    addShake(game.cameraRig, 0.6);
    spawnDust(game.effects, flight.x, flight.y - 1, flight.z, 20);
  } else if (event.type === 'crash') {
    crashNoise(game.audio);
    addShake(game.cameraRig, 1);
    spawnCrash(game.effects, flight.x, flight.y, flight.z);
    centreMessage(game.hud, 'CRASHED', crashReason(event.reason));
  } else if (event.type === 'flameout') {
    toast(game.hud, 'Fuel empty — engine out! Glide to a field');
    centreMessage(game.hud, 'ENGINE OUT', 'Find a field and glide in');
  } else if (event.type === 'boundary') {
    toast(game.hud, 'Edge of the valley — turning back');
  }
}

function crashReason(reason) {
  const reasons = {
    'hard-landing': 'The arrival was too hard.',
    'gear-up': 'Landed with the gear up.',
    ditching: 'Ditched at speed — the water won.',
    terrain: 'Flew into the terrain.',
  };
  return reasons[reason] || 'Aircraft lost.';
}

/** Handle one mission event: rings, stops, completion. */
function handleMissionEvent(event) {
  const flight = game.flight;
  if (event.type === 'ring') {
    ringChime(game.audio);
    passRing(game.effects, event.index, event.ring);
    centreMessage(game.hud, `RING ${event.index + 1}`, `${game.mission.ringsPassed} of ${game.mission.rings.length}`);
    // Recolour the remaining rings so the next one stands out.
    const next = game.mission.rings[game.mission.ringIndex];
    if (next) setRingCourse(game.effects, game.mission.rings, game.mission.ringIndex);
  } else if (event.type === 'stop') {
    toast(game.hud, `Delivered at ${event.field.name}`);
    centreMessage(game.hud, event.field.name.toUpperCase(), 'Stop complete');
  } else if (event.type === 'pickup') {
    toast(game.hud, 'Hiker aboard — fly them home');
    centreMessage(game.hud, 'PASSENGER ABOARD', 'Harbour Field, please');
  } else if (event.type === 'complete') {
    missionFanfare(game.audio);
    finishMission(true);
  } else if (event.type === 'failed') {
    finishMission(false);
  } else if (event.type === 'circuit') {
    toast(game.hud, game.mission.objective);
  }
}

/** End the mission: record it, show the debrief after a beat. */
function finishMission(completed) {
  if (!game.mission || game.mission.state === 'complete' || game.mission.state === 'failed') {
    // completeMission/failMission already set the state; just show the screen.
  }
  if (game.debriefTimer) return;
  game.debriefTimer = window.setTimeout(() => {
    game.debriefTimer = null;
    if (!game.mission) return;
    recordMission(game.save, game.mission);
    game.screen = 'debrief';
    showDebrief(game.ui, game.mission);
    window.__skyharbour.state = 'debrief';
  }, 1400);
}

/** One rendered frame: step the world, then draw it. */
function renderFrame(dt) {
  const flight = game.flight;
  const elapsed = game.elapsed;
  // Time of day creeps forward slowly.
  flight.timeOfDay = (flight.timeOfDay + dt * 0.004) % 24;
  updateWind(flight, elapsed, null);
  animateTerrain(game.terrain, flight.windDir, elapsed);
  updateSky(game.sky, flight.timeOfDay, flight.weather, { x: flight.x, y: flight.y, z: flight.z }, dt, elapsed);
  updateTraffic(game.traffic, dt, elapsed);
  animateRings(game.effects, game.mission && game.mission.kind === 'rings' ? game.mission.ringIndex : -1, elapsed);
  updateEffects(game.effects, dt);
  // Aircraft mesh follows the flight state.
  if (game.aircraft) {
    game.aircraft.position.set(flight.x, flight.y, flight.z);
    game.aircraft.rotation.order = 'YXZ';
    game.aircraft.rotation.y = -degToRad(flight.heading);
    game.aircraft.rotation.x = degToRad(flight.pitch);
    game.aircraft.rotation.z = -degToRad(flight.roll);
    animateAircraft(game.aircraft, flight, dt, elapsed);
    setCockpitView(game.aircraft, game.cameraRig.mode === 'cockpit');
  }
  // Smoke from a damaged engine.
  if (flight.damage > 30 && !flight.onGround) {
    game.smokeTimer -= dt;
    if (game.smokeTimer <= 0) {
      game.smokeTimer = 0.4;
      spawnSmoke(game.effects, flight.x, flight.y, flight.z);
    }
  }
  // Dust while rolling fast on a rough strip.
  if (flight.onGround && flight.airspeedKmh > 60) {
    game.dustTimer -= dt;
    if (game.dustTimer <= 0) {
      game.dustTimer = 0.12;
      spawnDust(game.effects, flight.x, flight.y - 1, flight.z, 4);
    }
  }
  // Contrail at altitude and speed.
  if (!flight.onGround && flight.y > 800 && flight.airspeedKmh > 220) {
    const tipA = new THREE.Vector3(-6, flight.y, flight.z);
    const tipB = new THREE.Vector3(6, flight.y, flight.z);
    updateContrail(game.effects, tipA, tipB, dt);
  }
  updateCamera(game.cameraRig, flight, game.aircraft, dt, elapsed);
  game.renderer.render(game.scene, game.camera);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - game.lastFrame) / 1000, 0.001, 0.05);
  game.lastFrame = now;
  if (game.paused || game.screen === 'title' || game.screen === 'debrief') {
    // Title and debrief keep the world alive behind the panel.
    game.elapsed += dt;
    if (game.screen === 'title') {
      game.flight.timeOfDay = (game.flight.timeOfDay + dt * 0.004) % 24;
      updateWind(game.flight, game.elapsed, null);
      animateTerrain(game.terrain, game.flight.windDir, game.elapsed);
      updateSky(game.sky, game.flight.timeOfDay, game.flight.weather, { x: 0, y: 60, z: 600 }, dt, game.elapsed);
      updateTraffic(game.traffic, dt, game.elapsed);
      updateEffects(game.effects, dt);
      updateCamera(game.cameraRig, game.flight, game.aircraft, dt, game.elapsed);
      game.renderer.render(game.scene, game.camera);
    }
    return;
  }
  if (game.screen !== 'flying') return;
  game.elapsed += dt;
  pollInput(game.input, dt);
  // Stall warning beep, at most once a second.
  if (game.flight.stalled && game.elapsed - game.lastStallBeep > 1) {
    game.lastStallBeep = game.elapsed;
    stallBeep(game.audio);
  }
  const input = {
    pitch: game.input.pitch,
    roll: game.input.roll,
    yaw: game.input.yaw,
    throttle: game.input.throttle,
    brakes: game.input.brakes,
  };
  game.flight.flaps = game.flight.flaps; // flaps change only via the F key
  stepFlight(game.flight, input, dt, game.elapsed);
  for (const event of game.flight.events) handleFlightEvent(event);
  if (game.mission) {
    const missionEvents = updateMission(game.mission, game.flight, dt, game.elapsed);
    for (const event of missionEvents) handleMissionEvent(event);
  }
  updateEngineAudio(game.audio, {
    throttle: game.flight.throttle,
    airspeedKmh: game.flight.airspeedKmh,
    engineOn: game.flight.engineOn,
    onGround: game.flight.onGround,
    rain: game.flight.weather.rain,
  });
  updateHud(game.hud, game.flight, game.mission, dt);
  renderFrame(dt);
}

boot();
