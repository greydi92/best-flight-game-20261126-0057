// SKYHARBOUR — missions: the seven sorties, their objectives, timers,
// scoring and medals. One file, one job: given flight events and the aircraft
// position, decide what the pilot still has to do and when the sortie ends.

import { AIRFIELDS, MISSIONS, SCORING, aircraftById, airfieldById, medalForTime } from './config.js';
import { bearingTo, distanceTo, nearestAirfield } from './physics.js';
import { groundHeight } from './terrain.js';
import { clamp, fmtTime, mulberry32 } from './utils.js';

/** Fresh mission state for `mission`, with the aircraft placed at its start field. */
export function createMission(missionId) {
  const def = MISSIONS.find((m) => m.id === missionId) || MISSIONS[0];
  const rng = mulberry32(def.id.length * 7919 + 13);
  const mission = {
    def,
    id: def.id,
    name: def.name,
    kind: def.kind,
    state: 'briefing', // briefing | flying | complete | failed
    startedAt: 0,
    elapsed: 0,
    score: 0,
    medal: 'none',
    // Objective tracking.
    rings: [],
    ringIndex: 0,
    ringsPassed: 0,
    ringsMissed: 0,
    stops: [],
    stopIndex: 0,
    stopsDone: 0,
    // Circuit mission: waypoints around the home field.
    circuitLeg: 0, // 0 takeoff, 1 downwind, 2 base, 3 final, 4 landed
    circuitDone: false,
    // Rescue mission.
    passenger: false,
    // Messages shown to the pilot, newest last.
    log: [],
    // Objective text for the HUD.
    objective: '',
    // End-of-mission summary, filled on completion.
    result: null,
  };
  if (def.kind === 'rings') mission.rings = buildRingCourse(def, rng);
  if (def.kind === 'delivery' || def.kind === 'tour') {
    mission.stops = (def.stops || []).map((id) => ({ id, field: airfieldById(id), done: false }));
  }
  if (def.kind === 'rescue') {
    mission.stops = [{ id: 'northpass', field: airfieldById('northpass'), done: false }];
  }
  mission.objective = objectiveText(mission);
  return mission;
}

/** Ring positions for a ring-course mission, strung across the valley. */
export function buildRingCourse(def, rng) {
  const count = def.rings || 10;
  const rings = [];
  // Hand-placed anchor points make the course readable; jitter keeps it fresh.
  const anchors = [
    [0, 500, -600, 320], [-1800, 800, -1400, 380], [-3200, 1100, -2400, 420],
    [-1400, 900, -3600, 380], [800, 700, -3800, 420], [2600, 600, -2600, 360],
    [3400, 500, -800, 340], [2400, 800, 900, 400], [600, 650, 1800, 360],
    [-1200, 900, 2600, 420], [-2800, 700, 1800, 380], [-3600, 1000, 200, 440],
  ];
  const start = def.from === 'southridge' ? 8 : 0;
  for (let i = 0; i < count; i += 1) {
    const a = anchors[(start + i) % anchors.length];
    const jx = (rng() - 0.5) * 500;
    const jz = (rng() - 0.5) * 500;
    const x = a[0] + jx;
    const z = a[1] === undefined ? a[2] + jz : a[2] + jz;
    const ground = groundHeight(x, z);
    const y = Math.max(ground + 90, a[3] + (rng() - 0.5) * 120);
    rings.push({
      x, y, z,
      radius: 26,
      heading: 0,
      passed: false,
      index: i,
    });
  }
  return rings;
}

/** Human-readable objective line for the HUD. */
export function objectiveText(mission) {
  if (mission.kind === 'circuit') {
    const legs = ['Take off from Harbour Field', 'Fly the downwind leg', 'Turn base', 'Turn final', 'Land on the runway'];
    return legs[Math.min(mission.circuitLeg, 4)];
  }
  if (mission.kind === 'rings') {
    if (mission.ringIndex >= mission.rings.length) return 'Course complete — land at Harbour Field';
    return `Ring ${mission.ringIndex + 1} of ${mission.rings.length}`;
  }
  if (mission.kind === 'rescue') {
    if (!mission.passenger) return 'Land at North Pass and pick up the hiker';
    return 'Bring the hiker home to Harbour Field';
  }
  if (mission.kind === 'delivery' || mission.kind === 'tour') {
    const next = mission.stops[mission.stopIndex];
    if (!next) return 'Return to Harbour Field';
    return `Land at ${next.field.name} (${mission.stopIndex + 1}/${mission.stops.length})`;
  }
  return 'Fly';
}

export function startMission(mission, now) {
  mission.state = 'flying';
  mission.startedAt = now;
  mission.elapsed = 0;
  mission.log.push({ t: 0, text: `${mission.name} — ${mission.def.brief}` });
}

/**
 * Advance the mission by dt. `flight` is the flight state; `events` are the
 * flight events this step. Returns mission events: 'ring', 'stop', 'complete',
 * 'failed', 'circuit'.
 */
export function updateMission(mission, flight, dt, now) {
  const out = [];
  if (mission.state !== 'flying') return out;
  mission.elapsed = now - mission.startedAt;

  // --- Ring courses: passing through the next ring. ---
  if (mission.kind === 'rings') {
    const ring = mission.rings[mission.ringIndex];
    if (ring) {
      const d = Math.hypot(flight.x - ring.x, flight.y - ring.y, flight.z - ring.z);
      if (d < ring.radius) {
        ring.passed = true;
        mission.ringsPassed += 1;
        mission.ringIndex += 1;
        mission.score += 100;
        out.push({ type: 'ring', ring, index: ring.index });
        mission.log.push({ t: mission.elapsed, text: `Ring ${ring.index + 1} — nice flying!` });
        if (mission.ringIndex >= mission.rings.length) {
          completeMission(mission, flight, 'All rings flown');
          out.push({ type: 'complete' });
        }
      } else if (!flight.onGround) {
        // Flying past the ring without entering it counts as a miss.
        const past = ringPassedPlane(flight, ring);
        if (past && !ring.missed) {
          ring.missed = true;
          mission.ringsMissed += 1;
          mission.elapsed += 0; // the penalty is time, applied at scoring
          mission.log.push({ t: mission.elapsed, text: `Missed ring ${ring.index + 1} (+${SCORING.ringMissPenaltySeconds}s)` });
          mission.ringIndex += 1;
          if (mission.ringIndex >= mission.rings.length) {
            completeMission(mission, flight, 'Course finished — some rings missed');
            out.push({ type: 'complete' });
          }
        }
      }
    }
  }

  // --- Delivery / tour: land at each stop in order. ---
  if (mission.kind === 'delivery' || mission.kind === 'tour') {
    const next = mission.stops[mission.stopIndex];
    if (next) {
      const landed = flight.events.find((e) => e.type === 'touchdown');
      if (landed && flight.lastLanding && flight.lastLanding.quality !== 'hard') {
        const here = nearestAirfield(flight.x, flight.z, flight);
        if (here && here.id === next.id) {
          next.done = true;
          mission.stopsDone += 1;
          mission.stopIndex += 1;
          mission.score += 200 + (flight.lastLanding.score || 0);
          mission.log.push({ t: mission.elapsed, text: `Landed at ${here.name} — ${flight.lastLanding.label}` });
          out.push({ type: 'stop', field: here });
          if (mission.stopIndex >= mission.stops.length) {
            mission.log.push({ t: mission.elapsed, text: 'All stops done — head home to Harbour Field' });
          }
        }
      }
      // After the last stop, landing at Harbour Field completes the sortie.
      if (mission.stopIndex >= mission.stops.length) {
        const landed = flight.events.find((e) => e.type === 'touchdown');
        if (landed) {
          const here = nearestAirfield(flight.x, flight.z, flight);
          if (here && here.id === 'harbour') {
            completeMission(mission, flight, 'All deliveries made');
            out.push({ type: 'complete' });
          }
        }
      }
    }
  }

  // --- Rescue: land at North Pass, pick up, return home. ---
  if (mission.kind === 'rescue') {
    const landed = flight.events.find((e) => e.type === 'touchdown');
    if (landed) {
      const here = nearestAirfield(flight.x, flight.z, flight);
      if (!mission.passenger && here && here.id === 'northpass') {
        mission.passenger = true;
        mission.stopsDone = 1;
        mission.score += 400;
        mission.log.push({ t: mission.elapsed, text: 'Hiker aboard! Now bring them home to Harbour Field.' });
        out.push({ type: 'pickup', field: here });
      } else if (mission.passenger && here && here.id === 'harbour') {
        completeMission(mission, flight, 'Hiker delivered safely');
        out.push({ type: 'complete' });
      }
    }
  }

  // --- Circuit: takeoff, four legs, land. ---
  if (mission.kind === 'circuit') {
    const tookOff = flight.events.find((e) => e.type === 'takeoff');
    if (tookOff && mission.circuitLeg === 0) {
      mission.circuitLeg = 1;
      mission.score += 100;
      mission.log.push({ t: mission.elapsed, text: 'Airborne! Climb to 250 m and turn downwind.' });
      out.push({ type: 'circuit', leg: 1 });
    }
    if (mission.circuitLeg === 1 && flight.y > 280 && flight.airspeedKmh > 120) {
      mission.circuitLeg = 2;
      mission.log.push({ t: mission.elapsed, text: 'Downwind leg — keep the runway on your left.' });
      out.push({ type: 'circuit', leg: 2 });
    }
    if (mission.circuitLeg === 2 && mission.elapsed > 45) {
      // Base leg once the aircraft has flown a while downwind.
      const d = Math.hypot(flight.x - 0, flight.z - 600);
      if (d > 1800) {
        mission.circuitLeg = 3;
        mission.log.push({ t: mission.elapsed, text: 'Base leg — turn in for final.' });
        out.push({ type: 'circuit', leg: 3 });
      }
    }
    if (mission.circuitLeg === 3) {
      const landed = flight.events.find((e) => e.type === 'touchdown');
      if (landed) {
        const here = nearestAirfield(flight.x, flight.z, flight);
        if (here && here.id === 'harbour' && flight.lastLanding) {
          mission.circuitLeg = 4;
          mission.circuitDone = true;
          completeMission(mission, flight, flight.lastLanding.label);
          out.push({ type: 'complete' });
        }
      }
    }
  }

  // --- Failure: crash, or fuel exhaustion in the air. ---
  if (flight.crashed) {
    failMission(mission, flight, 'Aircraft lost');
    out.push({ type: 'failed' });
  } else if (!flight.engineOn && flight.fuelKg <= 0 && !flight.onGround && flight.y > 60) {
    // Gliding to a landing is still possible; only fail on impact.
  }

  mission.objective = objectiveText(mission);
  return out;
}

/** Has the aircraft flown past the ring's plane without entering it? Only
 * counts when the aircraft came close and is now clearly flying away: a
 * ring far ahead is never a miss, so the pilot can always fly back to it. */
function ringPassedPlane(flight, ring) {
  const d = Math.hypot(flight.x - ring.x, flight.y - ring.y, flight.z - ring.z);
  if (ring.closest === undefined) ring.closest = d;
  ring.closest = Math.min(ring.closest, d);
  return ring.closest < 400 && d > ring.closest + 150 && flight.airspeedKmh > 100;
}

/** Finish a mission: medal, score breakdown, debrief lines. */
export function completeMission(mission, flight, note) {
  if (mission.state !== 'flying') return;
  mission.state = 'complete';
  const timePenalty = (mission.ringsMissed || 0) * SCORING.ringMissPenaltySeconds;
  const totalTime = mission.elapsed + timePenalty;
  mission.medal = medalForTime(totalTime, mission.def.par);
  const landingScore = flight.lastLanding ? flight.lastLanding.score : 0;
  const fuelBonus = Math.round(flight.fuelKg * SCORING.fuelBonusPerKg);
  const damagePenalty = Math.round(flight.damage * SCORING.damagePenaltyPerPoint);
  const timeBonus = Math.max(0, Math.round((mission.def.par - totalTime) * 2));
  mission.score += landingScore + fuelBonus + timeBonus - damagePenalty;
  mission.result = {
    note,
    time: mission.elapsed,
    timeWithPenalties: totalTime,
    par: mission.def.par,
    medal: mission.medal,
    score: mission.score,
    landingScore,
    fuelBonus,
    damagePenalty,
    timeBonus,
    ringsPassed: mission.ringsPassed,
    ringsMissed: mission.ringsMissed,
    stopsDone: mission.stopsDone,
    maxAltitude: Math.round(flight.maxAltitude),
    maxSpeed: Math.round(flight.maxSpeedKmh),
    distanceKm: flight.distanceKm.toFixed(1),
    damage: Math.round(flight.damage),
    fuelLeft: Math.round(flight.fuelKg),
  };
}

/** Fail a mission: keep a partial score for the debrief. */
export function failMission(mission, flight, reason) {
  if (mission.state !== 'flying') return;
  mission.state = 'failed';
  mission.result = {
    note: reason,
    time: mission.elapsed,
    timeWithPenalties: mission.elapsed,
    par: mission.def.par,
    medal: 'none',
    score: Math.max(0, mission.score - SCORING.crashPenalty),
    landingScore: 0,
    fuelBonus: 0,
    damagePenalty: Math.round(flight.damage * SCORING.damagePenaltyPerPoint),
    timeBonus: 0,
    ringsPassed: mission.ringsPassed,
    ringsMissed: mission.ringsMissed,
    stopsDone: mission.stopsDone,
    maxAltitude: Math.round(flight.maxAltitude),
    maxSpeed: Math.round(flight.maxSpeedKmh),
    distanceKm: flight.distanceKm.toFixed(1),
    damage: Math.round(flight.damage),
    fuelLeft: Math.round(flight.fuelKg),
  };
}

/** Free-flight mode: no mission, just the valley and a score for fun. */
export function createFreeFlight() {
  return {
    def: { id: 'free', name: 'Free Flight', kind: 'free', par: 0, reward: 0, weather: 'calm', timeOfDay: 12 },
    id: 'free',
    name: 'Free Flight',
    kind: 'free',
    state: 'flying',
    startedAt: 0,
    elapsed: 0,
    score: 0,
    medal: 'none',
    rings: [],
    ringIndex: 0,
    ringsPassed: 0,
    ringsMissed: 0,
    stops: [],
    stopIndex: 0,
    stopsDone: 0,
    circuitLeg: 0,
    circuitDone: false,
    passenger: false,
    log: [{ t: 0, text: 'Free flight — explore the valley, land anywhere.' }],
    objective: 'Explore the valley',
    result: null,
  };
}
