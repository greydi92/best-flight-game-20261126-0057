// SKYHARBOUR — HUD: the instruments the pilot actually flies by. A DOM
// overlay (crisp at any resolution) plus a canvas artificial horizon.

import { clamp, compassPoint, fmtAlt, fmtFuel, fmtHeading, fmtSpeed, fmtTime, wrapDegrees } from './utils.js';
import { bearingTo, distanceTo } from './physics.js';

/** Build the HUD DOM inside `root` and return the live element handles. */
export function createHud(root) {
  root.innerHTML = `
  <div id="hud" class="hud">
    <div class="hud-top">
      <div class="hud-block" id="hud-alt"><span class="hud-label">ALT</span><span class="hud-value" id="hud-alt-v">0</span><span class="hud-unit">m</span></div>
      <div class="hud-block" id="hud-spd"><span class="hud-label">SPEED</span><span class="hud-value" id="hud-spd-v">0</span><span class="hud-unit">km/h</span></div>
      <div class="hud-block" id="hud-hdg"><span class="hud-label">HEADING</span><span class="hud-value" id="hud-hdg-v">000°</span><span class="hud-unit" id="hud-hdg-c">N</span></div>
      <div class="hud-block" id="hud-vs"><span class="hud-label">CLIMB</span><span class="hud-value" id="hud-vs-v">0</span><span class="hud-unit">m/s</span></div>
      <div class="hud-block" id="hud-time"><span class="hud-label">TIME</span><span class="hud-value" id="hud-time-v">0:00</span><span class="hud-unit" id="hud-time-l">MISSION</span></div>
      <div class="hud-block" id="hud-score"><span class="hud-label">SCORE</span><span class="hud-value" id="hud-score-v">0</span><span class="hud-unit" id="hud-score-l">PTS</span></div>
    </div>
    <div id="compass" class="compass"><div id="compass-strip" class="compass-strip"></div><div class="compass-needle">▲</div></div>
    <div id="horizon-wrap" class="horizon-wrap"><canvas id="horizon" width="220" height="220"></canvas><div class="horizon-label">ATTITUDE</div></div>
    <div class="hud-left">
      <div class="gauge"><span class="gauge-label">THROTTLE</span><div class="gauge-bar"><div id="gauge-thr" class="gauge-fill thr"></div></div><span class="gauge-value" id="gauge-thr-v">0%</span></div>
      <div class="gauge"><span class="gauge-label">FUEL</span><div class="gauge-bar"><div id="gauge-fuel" class="gauge-fill fuel"></div></div><span class="gauge-value" id="gauge-fuel-v">0 kg</span></div>
      <div class="gauge"><span class="gauge-label">DAMAGE</span><div class="gauge-bar"><div id="gauge-dmg" class="gauge-fill dmg"></div></div><span class="gauge-value" id="gauge-dmg-v">0%</span></div>
      <div class="gauge"><span class="gauge-label">FLAPS</span><div class="gauge-steps" id="gauge-flaps"><span>0</span><span>1</span><span>2</span></div></div>
      <div class="gauge"><span class="gauge-label">GEAR</span><div class="gauge-steps" id="gauge-gear"><span>DOWN</span></div></div>
    </div>
    <div id="objective" class="objective"><span class="objective-tag">OBJECTIVE</span><span id="objective-text">—</span></div>
    <div id="target" class="target"><span id="target-arrow">➤</span><span id="target-text">—</span></div>
    <div id="warn" class="warn hidden">STALL</div>
    <div id="toasts" class="toasts"></div>
    <div id="centre-msg" class="centre-msg hidden"></div>
  </div>`;
  const $ = (id) => root.querySelector(`#${id}`);
  return {
    root,
    alt: $('hud-alt-v'), spd: $('hud-spd-v'), hdg: $('hud-hdg-v'), hdgC: $('hud-hdg-c'),
    vs: $('hud-vs-v'), time: $('hud-time-v'), timeLabel: $('hud-time-l'),
    score: $('hud-score-v'),
    compassStrip: $('compass-strip'),
    horizon: $('horizon'),
    thr: $('gauge-thr'), thrV: $('gauge-thr-v'),
    fuel: $('gauge-fuel'), fuelV: $('gauge-fuel-v'),
    dmg: $('gauge-dmg'), dmgV: $('gauge-dmg-v'),
    flaps: $('gauge-flaps'), gear: $('gauge-gear'),
    objective: $('objective-text'),
    target: $('target'), targetArrow: $('target-arrow'), targetText: $('target-text'),
    warn: $('warn'), toasts: $('toasts'), centreMsg: $('centre-msg'),
    lastToast: '',
    lastToastAt: 0,
  };
}

/** Update every HUD value from flight + mission state. */
export function updateHud(hud, flight, mission, dt) {
  const agl = Math.max(0, flight.y - groundHeightAt(flight));
  hud.alt.textContent = fmtAlt(agl);
  hud.spd.textContent = fmtSpeed(flight.airspeedKmh);
  hud.hdg.textContent = `${fmtHeading(flight.heading)}°`;
  hud.hdgC.textContent = compassPoint(flight.heading);
  const vs = flight.verticalSpeed;
  hud.vs.textContent = `${vs >= 0 ? '+' : ''}${vs.toFixed(1)}`;
  hud.time.textContent = fmtTime(mission ? mission.elapsed : flight.flightSeconds);
  hud.timeLabel.textContent = mission && mission.kind !== 'free' ? 'MISSION' : 'FLIGHT';
  hud.score.textContent = mission ? String(mission.score) : '0';
  hud.objective.textContent = mission ? mission.objective : '—';

  // Throttle / fuel / damage bars.
  hud.thr.style.width = `${Math.round(flight.throttle * 100)}%`;
  hud.thrV.textContent = `${Math.round(flight.throttle * 100)}%`;
  const fuelPct = clamp((flight.fuelKg / flight.spec.fuelKg) * 100, 0, 100);
  hud.fuel.style.width = `${fuelPct}%`;
  hud.fuelV.textContent = fmtFuel(flight.fuelKg);
  hud.fuel.classList.toggle('low', fuelPct < 20);
  hud.dmg.style.width = `${Math.round(flight.damage)}%`;
  hud.dmgV.textContent = `${Math.round(flight.damage)}%`;
  hud.dmg.classList.toggle('bad', flight.damage > 50);
  // Flaps steps.
  const steps = hud.flaps.querySelectorAll('span');
  steps.forEach((s, i) => s.classList.toggle('on', i <= flight.flaps));
  hud.gear.innerHTML = flight.gearDown ? '<span class="on">DOWN</span>' : '<span class="warn-inline">UP</span>';

  // Stall / low-fuel warnings.
  if (flight.stalled) {
    hud.warn.textContent = 'STALL — NOSE DOWN, FULL THROTTLE';
    hud.warn.classList.remove('hidden');
    hud.warn.classList.add('stall');
  } else if (fuelPct < 12 && fuelPct > 0) {
    hud.warn.textContent = 'LOW FUEL — LAND SOON';
    hud.warn.classList.remove('hidden', 'stall');
  } else if (flight.fuelKg <= 0 && !flight.onGround) {
    hud.warn.textContent = 'FUEL EMPTY — GLIDE TO A FIELD';
    hud.warn.classList.remove('hidden', 'stall');
  } else {
    hud.warn.classList.add('hidden');
  }

  drawCompass(hud, flight.heading);
  drawHorizon(hud, flight);
  drawTargetArrow(hud, flight, mission);
}

// Ground height under the aircraft, imported lazily to avoid a cycle.
import { groundHeight } from './terrain.js';
function groundHeightAt(flight) {
  return groundHeight(flight.x, flight.z);
}

/** The compass strip: headings scroll under a fixed needle. */
function drawCompass(hud, heading) {
  const strip = hud.compassStrip;
  if (!strip) return;
  const span = 90; // degrees visible
  const start = Math.floor((heading - span / 2) / 10) * 10;
  let html = '';
  for (let d = start; d <= heading + span / 2 + 10; d += 10) {
    const wrapped = ((d % 360) + 360) % 360;
    const rel = ((wrapped - heading + 540) % 360) - 180;
    const left = 50 + (rel / span) * 100;
    if (left < -4 || left > 104) continue;
    const label = wrapped % 90 === 0 ? ['N', 'E', 'S', 'W'][Math.round(wrapped / 90) % 4] : String(wrapped).padStart(3, '0');
    html += `<span class="tick" style="left:${left.toFixed(1)}%">${label}</span>`;
  }
  if (strip._last !== html) {
    strip.innerHTML = html;
    strip._last = html;
  }
}

/** The artificial horizon: sky, ground, pitch ladder and roll pointer. */
function drawHorizon(hud, flight) {
  const canvas = hud.horizon;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const R = 96;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  // Sky and ground, rotated by roll and shifted by pitch.
  ctx.translate(cx, cy);
  ctx.rotate((-flight.roll * Math.PI) / 180);
  const pitchPx = clamp(flight.pitch, -30, 30) * 2.4;
  ctx.translate(0, pitchPx);
  ctx.fillStyle = '#3f7fc4';
  ctx.fillRect(-R - 10, -R - 10 - pitchPx, R * 2 + 20, R + 10 + pitchPx);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-R - 10, 0, R * 2 + 20, R + 20);
  // Pitch ladder lines every 10 degrees.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.5;
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  for (const deg of [-20, -10, 10, 20]) {
    const y = -deg * 2.4;
    ctx.beginPath();
    ctx.moveTo(-34, y);
    ctx.lineTo(34, y);
    ctx.stroke();
    ctx.fillText(String(Math.abs(deg)), 46, y + 4);
  }
  ctx.restore();
  // Fixed horizon line and aircraft symbol.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 44, cy);
  ctx.lineTo(cx - 12, cy);
  ctx.moveTo(cx + 12, cy);
  ctx.lineTo(cx + 44, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
  // Roll pointer at the top.
  const rollRad = (-flight.roll * Math.PI) / 180;
  const px = cx + Math.sin(rollRad) * (R - 8);
  const py = cy - Math.cos(rollRad) * (R - 8);
  ctx.fillStyle = '#ffc21c';
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  // Rim ticks.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (let a = 0; a < 360; a += 30) {
    const r1 = R - 2;
    const r2 = R - 8;
    const rad = (a * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(rad) * r1, cy - Math.cos(rad) * r1);
    ctx.lineTo(cx + Math.sin(rad) * r2, cy - Math.cos(rad) * r2);
    ctx.stroke();
  }
}

/** Point the pilot at the next objective with an arrow and a distance. */
function drawTargetArrow(hud, flight, mission) {
  if (!mission || mission.state !== 'flying') {
    hud.target.style.display = 'none';
    return;
  }
  let target = null;
  let label = '';
  if (mission.kind === 'rings') {
    const ring = mission.rings[mission.ringIndex];
    if (ring) { target = { x: ring.x, y: ring.y, z: ring.z }; label = `RING ${ring.index + 1}`; }
  } else if (mission.kind === 'delivery' || mission.kind === 'tour' || mission.kind === 'rescue') {
    const next = mission.stops[mission.stopIndex];
    if (next && !mission.passenger) { target = { x: next.field.x, y: next.field.elevation, z: next.field.z }; label = next.field.name.toUpperCase(); }
    else if (mission.passenger) { target = { x: 0, y: 42, z: 600 }; label = 'HARBOUR FIELD'; }
    else if (mission.stopIndex >= mission.stops.length) { target = { x: 0, y: 42, z: 600 }; label = 'HARBOUR FIELD'; }
  } else if (mission.kind === 'circuit') {
    target = { x: 0, y: 42, z: 600 };
    label = 'HARBOUR FIELD';
  }
  if (!target) {
    hud.target.style.display = 'none';
    return;
  }
  hud.target.style.display = 'flex';
  const bearing = bearingTo(flight, target.x, target.z);
  const rel = wrapDegrees(bearing - flight.heading);
  hud.targetArrow.style.transform = `rotate(${rel}deg)`;
  const dist = distanceTo(flight, target.x, target.z);
  const distText = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
  hud.targetText.textContent = `${label} · ${distText}`;
}

/** Show a short toast message (deduplicated within 1.5 s). */
export function toast(hud, text) {
  const now = performance.now();
  if (text === hud.lastToast && now - hud.lastToastAt < 1500) return;
  hud.lastToast = text;
  hud.lastToastAt = now;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  hud.toasts.appendChild(el);
  while (hud.toasts.children.length > 4) hud.toasts.removeChild(hud.toasts.firstChild);
  window.setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 4200);
}

/** A big centre-screen message (e.g. "RING 3!" / "TOUCHDOWN"). */
export function centreMessage(hud, text, sub) {
  hud.centreMsg.innerHTML = `<div class="centre-main">${text}</div>${sub ? `<div class="centre-sub">${sub}</div>` : ''}`;
  hud.centreMsg.classList.remove('hidden');
  hud.centreMsg.classList.remove('pop');
  void hud.centreMsg.offsetWidth; // restart the animation
  hud.centreMsg.classList.add('pop');
  window.setTimeout(() => hud.centreMsg.classList.add('hidden'), 2200);
}
