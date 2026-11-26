// SKYHARBOUR — screenshot scenes: ?shot=takeoff|rings|landing|cockpit.
// Each scene plays the real game forward from a fresh start with a simple
// autopilot, so every screenshot is a genuine render and the same seed
// always gives the same frame. No mock scene exists anywhere.

import { stepFlight, bearingTo, distanceTo } from './physics.js';
import { updateMission } from './missions.js';
import { stageTrafficPlane } from './traffic.js';
import { clamp, degToRad, wrapDegrees } from './utils.js';

/** Steer toward a point: returns { pitch, roll, yaw, throttle }. */
function autopilotToward(flight, tx, ty, tz, dt) {
  const bearing = bearingTo(flight, tx, tz);
  const rel = wrapDegrees(bearing - flight.heading);
  const dist = distanceTo(flight, tx, tz);
  const wantAlt = ty;
  const altErr = wantAlt - flight.y;
  const input = { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, brakes: false };
  // Roll toward the target, capped so the turn stays coordinated.
  input.roll = clamp(rel / 60, -0.55, 0.55);
  // Pitch to hold the wanted altitude.
  input.pitch = clamp(altErr / 60, -0.5, 0.6);
  // Slow down when close to a landing target.
  if (dist < 600) input.throttle = 0.35;
  if (dist < 200) input.throttle = 0.2;
  return input;
}

/** Run the flight model forward for `seconds` with the autopilot. */
function flyFor(game, seconds, targetFn) {
  const steps = Math.round(seconds * 60);
  const dt = 1 / 60;
  for (let i = 0; i < steps; i += 1) {
    const elapsed = game.elapsed + dt;
    game.elapsed = elapsed;
    const target = targetFn(game.flight, elapsed);
    const input = autopilotToward(game.flight, target.x, target.y, target.z, dt);
    if (game.flight.onGround && game.flight.airspeedKmh < 90) {
      input.pitch = 0;
      input.throttle = 1;
    }
    if (game.flight.onGround && game.flight.airspeedKmh >= 95) {
      input.pitch = 0.8;
      input.throttle = 1;
    }
    game.input.throttle = input.throttle;
    stepFlight(game.flight, {
      pitch: input.pitch, roll: input.roll, yaw: input.yaw,
      throttle: input.throttle, brakes: input.brakes,
    }, dt, elapsed);
    if (game.mission) {
      updateMission(game.mission, game.flight, dt, elapsed);
    }
    if (game.flight.crashed) break;
  }
}

/**
 * Stage a screenshot scene on the live game object. `game` carries
 * flight, mission, camera rig, renderer, effects and the scene.
 * Returns the HUD caption to show.
 */
export function stageShot(name, game) {
  const dt = 1 / 60;
  if (name === 'rings') {
    // Ring Run: close on the FIRST ring until it fills the frame — a
    // distant ring is a hairline. The first ring is approached straight
    // north, so the aircraft meets it face-on; later rings are crossed
    // sideways and read edge-on even when centred.
    game.startMissionById('ring-run');
    game.setCameraMode('chase');
    flyFor(game, 12, (f) => {
      const ring = game.mission.rings[game.mission.ringIndex];
      if (ring) return { x: ring.x, y: ring.y, z: ring.z };
      return { x: 0, y: 500, z: 600 };
    });
    // Close-in: steer at the next ring until it fills the frame. Two
    // phases: steer at the ring itself with full bank until the bearing
    // error is small (a far aim point corrects too slowly), then lock the
    // aim far beyond the ring and damp the bank to nearly wings-level, so
    // the ring stays centred instead of sliding left while the aircraft
    // turns toward it (the chase camera rolls with the bank). Frame when
    // centred inside 200 m, or at 190 m at the latest.
    let aimPoint = null;
    for (let i = 0; i < 20 * 60; i += 1) {
      const ring = game.mission.rings[game.mission.ringIndex];
      if (!ring) break;
      const elapsed = game.elapsed + dt;
      game.elapsed = elapsed;
      const d0 = Math.hypot(
        game.flight.x - ring.x, game.flight.y - ring.y, game.flight.z - ring.z,
      );
      const bearingErr0 = Math.abs(wrapDegrees(
        bearingTo(game.flight, ring.x, ring.z) - game.flight.heading,
      ));
      let input;
      if (d0 < 400 && bearingErr0 < 8) {
        if (!aimPoint) {
          const dx = ring.x - game.flight.x;
          const dy = ring.y - game.flight.y;
          const dz = ring.z - game.flight.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          aimPoint = {
            x: ring.x + (dx / len) * 1500,
            y: ring.y + (dy / len) * 1500,
            z: ring.z + (dz / len) * 1500,
          };
        }
        input = autopilotToward(game.flight, aimPoint.x, aimPoint.y, aimPoint.z, dt);
        input.roll = clamp(input.roll * 0.3, -0.15, 0.15);
      } else {
        input = autopilotToward(game.flight, ring.x, ring.y, ring.z, dt);
      }
      game.input.throttle = input.throttle;
      stepFlight(game.flight, {
        pitch: input.pitch, roll: input.roll, yaw: input.yaw,
        throttle: input.throttle, brakes: false,
      }, dt, elapsed);
      updateMission(game.mission, game.flight, dt, elapsed);
      if (game.flight.crashed) break;
      const d = Math.hypot(
        game.flight.x - ring.x, game.flight.y - ring.y, game.flight.z - ring.z,
      );
      const bearingErr = Math.abs(wrapDegrees(
        bearingTo(game.flight, ring.x, ring.z) - game.flight.heading,
      ));
      if (d < 190 || (bearingErr < 4 && d < 200)) break;
    }
    return { caption: 'Ring Run — threading the valley rings' };
  }
  if (name === 'landing') {
    // Mail Run final to Mill Crossing, flown as a real straight-in. A flown
    // transit always arrives mid-turn with the runway off to one side, so
    // the scene starts the aircraft ON the extended centreline, 2.2 km out
    // at 320 m, heading 28 deg; the same autopilot then flies the final.
    game.startMissionById('mail-run');
    game.setCameraMode('chase');
    // Widen the chase framing for the final: from the normal distance the
    // near ~100 m of strip hides behind the aircraft.
    game.setChaseScale(1.6);
    // Mill runway heading is 28 deg; its axis is (sin28, -cos28).
    const ax = Math.sin((28 * Math.PI) / 180);
    const az = -Math.cos((28 * Math.PI) / 180);
    const threshold = { x: -2600 - ax * 300, y: 120, z: -900 - az * 300 };
    const f = game.flight;
    f.x = threshold.x - ax * 2200;
    f.z = threshold.z - az * 2200;
    f.y = 320;
    f.heading = 28;
    f.pitch = 0;
    f.roll = 0;
    f.airspeedKmh = 180;
    f.groundSpeedKmh = 180;
    f.throttle = 0.3;
    f.flaps = 1;
    f.gearDown = true;
    f.onGround = false;
    // Straight-in final: aim 1.5 km PAST the threshold along the
    // centreline, so the aircraft holds the runway heading.
    const farPoint = { x: threshold.x + ax * 1500, y: 120, z: threshold.z + az * 1500 };
    for (let i = 0; i < 60 * 60; i += 1) {
      const elapsed = game.elapsed + dt;
      game.elapsed = elapsed;
      const input = autopilotToward(game.flight, farPoint.x, farPoint.y, farPoint.z, dt);
      input.throttle = 0.3;
      game.input.throttle = input.throttle;
      stepFlight(game.flight, {
        pitch: input.pitch, roll: input.roll, yaw: input.yaw,
        throttle: input.throttle, brakes: false,
      }, dt, elapsed);
      updateMission(game.mission, game.flight, dt, elapsed);
      if (game.flight.onGround || game.flight.crashed) break;
      const d = distanceTo(game.flight, threshold.x, threshold.z);
      const aligned = Math.abs(wrapDegrees(game.flight.heading - 28)) < 15;
      // Close (120 m) so the strip starts just below the aircraft and runs
      // to the horizon.
      if ((d < 120 && aligned) || d < 60) break;
    }
    // Frame from the cockpit: in chase view the grass strip blends into
    // the field, but through the windscreen — over the lit dashboard —
    // the runway reads as a strip from below the nose to the horizon.
    game.setCameraMode('cockpit');
    return { caption: 'Mail Run — final approach to Mill Crossing' };
  }
  if (name === 'cockpit') {
    // Cockpit view over the town at dawn, mid-flight.
    game.startMissionById('first-solo');
    game.setCameraMode('cockpit');
    flyFor(game, 24, (f) => ({ x: 0, y: 420, z: 1500 }));
    return { caption: 'First Solo — dawn over Harbour Town, cockpit view' };
  }
  // Default: takeoff. The climb-out turns back low over Harbour Town, so
  // the cover frame has rooftops below instead of empty hills: the second
  // leg stays low (240 m) to the town's south end, right over the houses.
  game.startMissionById('first-solo');
  game.setCameraMode('chase');
  flyFor(game, 9, (f) => ({ x: 0, y: 300, z: -600 }));
  flyFor(game, 30, (f) => ({ x: 0, y: 240, z: 1700 }));
  // Park one AI mail plane ahead-left of the player, in frame — the valley
  // is shared airspace, and no shot showed traffic yet.
  {
    const f = game.flight;
    const hr = degToRad(f.heading);
    const fx = Math.sin(hr);
    const fz = -Math.cos(hr);
    const lx = -Math.cos(hr);
    const lz = -Math.sin(hr);
    stageTrafficPlane(
      game.traffic, 0,
      f.x + fx * 120 + lx * 70,
      f.y + 12,
      f.z + fz * 120 + lz * 70,
      f.heading, 48,
    );
  }
  return { caption: 'First Solo — climbing out over Harbour Town' };
}

/** Parse ?shot=name&seed=n from the page URL. */
export function shotFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (!shot) return null;
    return { name: shot, seed: Number(params.get('seed') || '1') };
  } catch (err) {
    return null;
  }
}
