// SKYHARBOUR — physics: the arcade flight model. Throttle, lift, stall,
// turning, wind, gusts, fuel burn and damage. One file, one job: given pilot
// input and the world, move the aircraft. No rendering, no missions here.
//
// The model is deliberately readable: speed in km/h, heading in degrees,
// pitch/roll in degrees, position in metres. Headings are clockwise from
// north: heading 0 flies toward -Z, heading 90 toward +X (east).

import { WORLD, WEATHER } from './config.js';
import { clamp, degToRad, lerp, moveToward, radToDeg, wrapDegrees } from './utils.js';
import { groundHeight, isWater, waterHeight } from './terrain.js';

/** Fresh flight state for an aircraft sitting on `field`, heading down the runway. */
export function createFlightState(spec, field, weatherKey, timeOfDay) {
  const headingRad = degToRad(field.heading);
  return {
    spec,
    field,
    weatherKey,
    weather: WEATHER[weatherKey] || WEATHER.calm,
    timeOfDay,
    // Position and attitude.
    x: field.x,
    z: field.z,
    y: field.elevation + 1.6, // metres above sea level (wheels on the strip)
    heading: field.heading, // degrees, 0 = north
    pitch: 0, // degrees, + = nose up
    roll: 0, // degrees, + = right wing down
    // Speeds.
    airspeedKmh: 0,
    verticalSpeed: 0, // m/s, + = climbing
    groundSpeedKmh: 0,
    // Engine and systems.
    throttle: 0,
    engineOn: true,
    fuelKg: spec.fuelKg,
    damage: 0, // 0..100
    flaps: 0, // 0, 1, 2
    gearDown: true,
    brakes: false,
    onGround: true,
    inWater: false,
    stalled: false,
    // Wind, recomputed each step.
    windKmh: 0,
    windDir: 200,
    gust: 0,
    // Events the main loop consumes: 'touchdown', 'crash', 'stall', 'takeoff', 'ring', 'landed'.
    events: [],
    // Landing quality of the last touchdown, null until one happens.
    lastLanding: null,
    // Flight time and distance, for the debrief.
    flightSeconds: 0,
    distanceKm: 0,
    maxAltitude: field.elevation,
    maxSpeedKmh: 0,
    // Gentle handling: how hard the pilot is pulling, for the buffet.
    gLoad: 1,
    crashed: false,
    landedAt: null, // airfield id of the last clean landing, if any
  };
}

/** Recompute the wind (base + gust) for this frame. */
export function updateWind(state, elapsed, rng) {
  const w = state.weather;
  const gustWave = Math.sin(elapsed * 0.9) * 0.5 + Math.sin(elapsed * 2.3) * 0.3 + Math.sin(elapsed * 5.1) * 0.2;
  state.gust = w.gust * Math.max(0, gustWave);
  state.windKmh = Math.max(0, w.windSpeed * 3.6 + state.gust * 3.6);
  state.windDir = w.windDir + Math.sin(elapsed * 0.13) * 12;
}

/**
 * Advance the flight model by dt seconds. `input` carries pitch/roll/yaw
 * axes (-1..1) and throttle (0..1). Returns nothing; state is mutated and
 * state.events lists what happened this step.
 */
export function stepFlight(state, input, dt, elapsed) {
  state.events.length = 0;
  if (state.crashed) return;
  const spec = state.spec;
  const kmhToMs = 1 / 3.6;

  // --- Engine and fuel. ---
  state.throttle = input.throttle;
  const burn = (WORLD.fuelBurnIdle + (state.throttle * state.throttle) * WORLD.fuelBurnCruise * spec.fuelBurn) * dt;
  if (state.engineOn && state.fuelKg > 0) {
    state.fuelKg = Math.max(0, state.fuelKg - burn);
    if (state.fuelKg <= 0) {
      state.engineOn = false;
      state.events.push({ type: 'flameout' });
    }
  }
  const thrust = state.engineOn ? state.throttle : 0;

  // --- Airspeed: thrust vs drag, with flaps and gear adding drag. ---
  const maxMs = (spec.maxSpeedKmh / 3.6) * (0.35 + 0.65 * thrust);
  const dragExtra = 1 + state.flaps * 0.18 + (state.gearDown ? 0.08 : 0) + (state.damage / 100) * 0.35;
  const accel = (maxMs - state.airspeedKmh * kmhToMs) * (0.28 + thrust * 0.5) / dragExtra;
  let speedMs = state.airspeedKmh * kmhToMs + accel * dt;
  // Rolling on the ground: brakes and grass slow the aircraft.
  if (state.onGround) {
    if (state.brakes) speedMs = Math.max(0, speedMs - 6 * dt);
    speedMs = Math.max(0, speedMs - 0.35 * dt);
  }
  speedMs = Math.max(0, speedMs);

  // --- Stall: below stall speed the wing stops flying. ---
  const stallMs = (spec.stallKmh / 3.6) * (1 - state.flaps * 0.09);
  const wasStalled = state.stalled;
  state.stalled = !state.onGround && speedMs < stallMs;
  if (state.stalled && !wasStalled) state.events.push({ type: 'stall' });

  // --- Attitude: roll and pitch follow the stick, with authority that
  // grows with airspeed and fades to nothing on the ground. ---
  const authority = state.onGround ? 0 : clamp(speedMs / stallMs, 0.25, 1.2);
  const rollRate = spec.rollRate * 55 * authority; // deg per second at full stick
  const pitchRate = spec.pitchRate * 32 * authority;
  let targetRoll = input.roll * 62 * spec.turnRate;
  // Coordinated turn: banking turns the heading (standard turn formula:
  // turn rate = g * tan(bank) / speed), so the heading follows the bank.
  const turnRateDeg = Math.tan(degToRad(state.roll)) * 9.81 / Math.max(8, speedMs) * (180 / Math.PI);
  state.heading = wrapDegrees(state.heading + clamp(turnRateDeg, -14, 14) * dt * (state.onGround ? 0 : 1));
  // Rudder adds a little heading authority on the ground and in the air.
  state.heading = wrapDegrees(state.heading + input.yaw * (state.onGround ? 14 : 6) * dt);
  // On the ground the aircraft steers with the rudder and rolls level.
  if (state.onGround) targetRoll = 0;
  state.roll = moveToward(state.roll, targetRoll, rollRate * dt * 1.6);
  let targetPitch = input.pitch * 16;
  if (state.stalled) targetPitch = -8; // the nose drops in a stall
  if (state.onGround && speedMs < stallMs * 1.05) targetPitch = 0; // cannot rotate yet
  state.pitch = moveToward(state.pitch, targetPitch, pitchRate * dt * 1.4);

  // --- Vertical speed: lift from speed and pitch, gravity always. ---
  const climbPower = spec.climbMs * thrust;
  let vs = 0;
  if (state.onGround) {
    vs = 0;
  } else if (state.stalled) {
    vs = -7 - (stallMs - speedMs) * 0.4;
  } else {
    const liftFactor = clamp(speedMs / stallMs, 0, 1.6);
    vs = Math.sin(degToRad(state.pitch)) * speedMs * liftFactor
      + (climbPower - 2.2) * liftFactor * 0.35
      - (1 - liftFactor) * 3.5;
    vs = clamp(vs, -18, spec.climbMs + 4);
  }
  state.verticalSpeed = lerp(state.verticalSpeed, vs, 1 - Math.exp(-3 * dt));

  // --- Wind: push the aircraft sideways and along its track. ---
  const windMs = state.windKmh * kmhToMs;
  const windRad = degToRad(state.windDir);
  const windX = Math.sin(windRad) * windMs;
  const windZ = Math.cos(windRad) * windMs;
  // Gusts buffet the roll a little.
  if (!state.onGround && state.weather.turbulence > 0.1) {
    state.roll += Math.sin(elapsed * 3.7) * state.weather.turbulence * 1.6 * dt * 10;
  }

  // --- Integrate position. ---
  const headingRad = degToRad(state.heading);
  const forwardX = Math.sin(headingRad);
  const forwardZ = -Math.cos(headingRad);
  const prevX = state.x;
  const prevZ = state.z;
  const prevY = state.y;
  state.x += (forwardX * speedMs + windX) * dt;
  state.z += (forwardZ * speedMs + windZ) * dt;
  state.y += state.verticalSpeed * dt;
  state.airspeedKmh = speedMs * 3.6;
  state.groundSpeedKmh = Math.hypot(state.x - prevX, state.z - prevZ) / dt * 3.6;
  state.distanceKm += Math.hypot(state.x - prevX, state.z - prevZ) / 1000;
  state.flightSeconds += dt;
  state.maxAltitude = Math.max(state.maxAltitude, state.y);
  state.maxSpeedKmh = Math.max(state.maxSpeedKmh, state.airspeedKmh);

  // --- Ground and water contact. ---
  const ground = groundHeight(state.x, state.z);
  const water = isWater(state.x, state.z);
  const surfaceY = water ? waterHeight(state.x, state.z) : ground;
  const gearY = state.y - 1.6; // wheels sit ~1.6 m below the origin
  if (gearY <= surfaceY) {
    const impactVs = state.verticalSpeed;
    const wasAirborne = !state.onGround;
    state.y = surfaceY + 1.6;
    state.onGround = true;
    state.inWater = water;
    if (wasAirborne) {
      state.events.push({ type: 'touchdown', vs: impactVs, water });
      state.lastLanding = gradeLanding(state, impactVs, water);
      if (impactVs < WORLD.gearDamageVs) {
        // A very hard arrival breaks the aircraft.
        state.damage = 100;
        state.crashed = true;
        state.events.push({ type: 'crash', reason: 'hard-landing', vs: impactVs });
      } else if (impactVs < WORLD.hardLandingVs) {
        const dmg = Math.round((-impactVs - 6.5) * 6 / spec.damageResist);
        state.damage = clamp(state.damage + dmg, 0, 100);
        state.events.push({ type: 'hard-landing', damage: dmg });
      }
      // A fast touchdown on rough ground with the gear up is a crash.
      if (!state.gearDown && !water && state.airspeedKmh > 60) {
        state.damage = 100;
        state.crashed = true;
        state.events.push({ type: 'crash', reason: 'gear-up', vs: impactVs });
      }
      // Water landings need the amphibian or very gentle speed.
      if (water && spec.id !== 'heron' && state.airspeedKmh > 110) {
        state.damage = 100;
        state.crashed = true;
        state.events.push({ type: 'crash', reason: 'ditching', vs: impactVs });
      }
    }
    // Rolling: keep the nose level, bleed the pitch.
    state.pitch = moveToward(state.pitch, 0, 40 * dt);
    state.roll = moveToward(state.roll, 0, 60 * dt);
    state.verticalSpeed = 0;
    // Takeoff: rotate speed reached and the pilot pulls up.
    if (state.airspeedKmh > spec.stallKmh * 1.08 && input.pitch > 0.35) {
      state.onGround = false;
      state.y += 0.6;
      state.verticalSpeed = 1.5;
      state.events.push({ type: 'takeoff' });
    }
  } else {
    if (state.onGround && state.y > surfaceY + 1.7) {
      state.onGround = false;
      state.events.push({ type: 'takeoff' });
    }
    state.inWater = false;
  }

  // --- Terrain collision while airborne: flying into a hillside. ---
  if (!state.onGround && !state.crashed) {
    const clearance = state.y - 1.6 - ground;
    if (clearance < 0) {
      if (state.airspeedKmh > WORLD.crashSpeedKmh) {
        state.damage = 100;
        state.crashed = true;
        state.events.push({ type: 'crash', reason: 'terrain', vs: state.verticalSpeed });
      } else {
        // A slow scrape: damage and a bounce back above the ground.
        state.damage = clamp(state.damage + 25, 0, 100);
        state.y = ground + 1.7;
        state.verticalSpeed = Math.abs(state.verticalSpeed) * 0.3 + 1;
        state.airspeedKmh *= 0.6;
        state.events.push({ type: 'scrape', damage: 25 });
        if (state.damage >= 100) {
          state.crashed = true;
          state.events.push({ type: 'crash', reason: 'terrain', vs: state.verticalSpeed });
        }
      }
    }
  }

  // --- World bounds: turn back with a warning instead of falling off. ---
  const half = WORLD.size / 2 - 100;
  if (Math.abs(state.x) > half || Math.abs(state.z) > half) {
    state.x = clamp(state.x, -half, half);
    state.z = clamp(state.z, -half, half);
    state.events.push({ type: 'boundary' });
  }
  if (state.y > WORLD.maxAltitude) {
    state.y = WORLD.maxAltitude;
    state.verticalSpeed = Math.min(0, state.verticalSpeed);
  }
  // G-load for the HUD buffet: banking hard at speed loads the wing.
  state.gLoad = 1 + Math.abs(Math.sin(degToRad(state.roll))) * (state.airspeedKmh / 300);
}

/** Grade a touchdown: perfect, good, hard or a crash. */
export function gradeLanding(state, vs, water) {
  const onRunway = nearestAirfield(state.x, state.z, state);
  if (water) {
    if (vs > -3.5 && state.airspeedKmh < 110) return { quality: 'perfect', label: 'Glass-smooth splashdown', score: 250 };
    if (vs > -6) return { quality: 'good', label: 'Splashdown', score: 120 };
    return { quality: 'hard', label: 'Hard splashdown', score: 0 };
  }
  if (!onRunway) {
    if (vs > -3) return { quality: 'good', label: 'Off-field landing', score: 80 };
    return { quality: 'hard', label: 'Rough off-field landing', score: 0 };
  }
  if (vs > -2.2 && Math.abs(state.roll) < 6) return { quality: 'perfect', label: 'Greased it — perfect landing', score: 250 };
  if (vs > -4.5) return { quality: 'good', label: 'Good landing', score: 120 };
  if (vs > -6.5) return { quality: 'hard', label: 'Firm landing', score: 40 };
  return { quality: 'hard', label: 'Hard landing', score: 0 };
}

/** The airfield whose strip the aircraft is currently over, or null. */
export function nearestAirfield(x, z, state) {
  const { AIRFIELDS } = requireFields();
  for (const f of AIRFIELDS) {
    const rad = degToRad(f.heading);
    const dx = x - f.x;
    const dz = z - f.z;
    // Runway axis is (sin h, -cos h); across is (cos h, sin h).
    const along = Math.abs(dx * Math.sin(rad) - dz * Math.cos(rad));
    const across = Math.abs(dx * Math.cos(rad) + dz * Math.sin(rad));
    if (along < f.length / 2 + 30 && across < f.width / 2 + 12) return f;
  }
  return null;
}

// Small indirection so this module does not import config twice in a cycle.
import { AIRFIELDS } from './config.js';
function requireFields() {
  return { AIRFIELDS };
}

/** Heading, in degrees, from the aircraft toward a target point. */
export function bearingTo(state, tx, tz) {
  const dx = tx - state.x;
  const dz = tz - state.z;
  // Forward is (sin h, -cos h), so bearing 0 means dz negative.
  return (Math.atan2(dx, -dz) * 180) / Math.PI;
}

/** Distance in metres to a target point. */
export function distanceTo(state, tx, tz) {
  return Math.hypot(tx - state.x, tz - state.z);
}
