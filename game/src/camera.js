// SKYHARBOUR — camera: chase, cockpit and tower views, with smoothing so
// the camera never fights the pilot. One file, one job: where the eye sits.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, degToRad, lerp } from './utils.js';

export const CAMERA_MODES = ['chase', 'cockpit', 'tower', 'cinematic'];

export function createCameraRig(camera) {
  return {
    camera,
    mode: 'chase',
    // Smoothed values so the view never snaps.
    smoothPos: new THREE.Vector3(0, 60, 40),
    smoothLook: new THREE.Vector3(0, 50, 0),
    smoothFov: 62,
    shake: 0,
    chaseScale: 1, // screenshot scenes widen the chase framing (landing)
    lookOffset: new THREE.Vector2(0, 0), // right-drag look-around
    cinematicAngle: 0,
  };
}

/** Cycle to the next camera mode; returns the new mode name. */
export function nextCameraMode(rig) {
  const i = CAMERA_MODES.indexOf(rig.mode);
  rig.mode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
  return rig.mode;
}

/** Add a camera shake impulse (0..1), e.g. on touchdown or crash. */
export function addShake(rig, amount) {
  rig.shake = Math.min(1, rig.shake + amount);
}

/**
 * Update the camera for one frame. `flight` is the flight state,
 * `aircraft` the aircraft group, `elapsed` the running clock.
 */
export function updateCamera(rig, flight, aircraft, dt, elapsed) {
  const cam = rig.camera;
  const headingRad = degToRad(flight.heading);
  const pitchRad = degToRad(flight.pitch);
  const rollRad = degToRad(flight.roll);
  // Aircraft forward vector (sin h, -cos h) tilted by pitch.
  const forward = new THREE.Vector3(
    Math.sin(headingRad) * Math.cos(pitchRad),
    Math.sin(pitchRad),
    -Math.cos(headingRad) * Math.cos(pitchRad),
  );
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const aircraftPos = new THREE.Vector3(flight.x, flight.y, flight.z);

  let targetPos = new THREE.Vector3();
  let targetLook = new THREE.Vector3();
  let targetFov = 62;

  if (rig.mode === 'chase') {
    // Behind and above, further back at speed, looking ahead of the nose.
    // chaseScale widens the framing for screenshot scenes (landing final).
    const speedFactor = clamp(flight.airspeedKmh / 300, 0, 1);
    const dist = (13 + speedFactor * 9) * rig.chaseScale;
    const height = (4.5 + speedFactor * 2.5) * rig.chaseScale;
    targetPos.copy(aircraftPos).addScaledVector(forward, -dist);
    targetPos.y += height;
    targetLook.copy(aircraftPos).addScaledVector(forward, 26);
    targetLook.y += 1.5;
    targetFov = 62 + speedFactor * 10;
  } else if (rig.mode === 'cockpit') {
    // In the seat: above the cowling, looking down the nose.
    targetPos.copy(aircraftPos).addScaledVector(forward, 1.4);
    targetPos.y += 2.0;
    targetPos.addScaledVector(right, rig.lookOffset.x * 1.2);
    targetLook.copy(aircraftPos).addScaledVector(forward, 120);
    targetLook.y -= 2;
    targetLook.addScaledVector(right, rig.lookOffset.x * 30);
    targetLook.y += rig.lookOffset.y * -18;
    targetFov = 68;
  } else if (rig.mode === 'tower') {
    // From the control tower at the home field, tracking the aircraft.
    const tower = new THREE.Vector3(-60, 42 + 30, 540);
    targetPos.copy(tower);
    targetLook.copy(aircraftPos);
    targetFov = 55;
  } else {
    // Cinematic: slow orbit around the aircraft.
    rig.cinematicAngle += dt * 0.12;
    const r = 26;
    targetPos.set(
      aircraftPos.x + Math.cos(rig.cinematicAngle) * r,
      aircraftPos.y + 7 + Math.sin(rig.cinematicAngle * 0.7) * 4,
      aircraftPos.z + Math.sin(rig.cinematicAngle) * r,
    );
    targetLook.copy(aircraftPos);
    targetFov = 58;
  }

  // Smooth the chase and cinematic moves; cockpit and tower snap lightly.
  const rate = rig.mode === 'cockpit' ? 14 : rig.mode === 'tower' ? 3 : 5.5;
  const k = 1 - Math.exp(-rate * dt);
  rig.smoothPos.lerp(targetPos, k);
  rig.smoothLook.lerp(targetLook, k);
  rig.smoothFov = lerp(rig.smoothFov, targetFov, 1 - Math.exp(-3 * dt));

  // Shake decays; apply a small random offset while it lasts.
  rig.shake = Math.max(0, rig.shake - dt * 1.4);
  const shakeAmp = rig.shake * rig.shake * 0.7;
  const sx = (Math.random() - 0.5) * shakeAmp;
  const sy = (Math.random() - 0.5) * shakeAmp;
  const sz = (Math.random() - 0.5) * shakeAmp;

  cam.position.set(
    rig.smoothPos.x + sx,
    rig.smoothPos.y + sy,
    rig.smoothPos.z + sz,
  );
  cam.lookAt(rig.smoothLook);
  // Roll the camera with the aircraft in chase view, gently.
  if (rig.mode === 'chase') {
    cam.rotateZ(-rollRad * 0.35);
  } else if (rig.mode === 'cockpit') {
    cam.rotateZ(-rollRad * 0.85);
  }
  if (Math.abs(cam.fov - rig.smoothFov) > 0.05) {
    cam.fov = rig.smoothFov;
    cam.updateProjectionMatrix();
  }
  cam.near = 0.1;
  cam.far = 20000;
}

/** Widen or tighten the chase framing (1 = normal). Used by screenshot scenes. */
export function setChaseScale(rig, scale) {
  rig.chaseScale = clamp(scale, 0.5, 3);
}

/** Place the camera instantly (used on reset / mission start). */
export function snapCamera(rig, flight) {
  const headingRad = degToRad(flight.heading);
  const forward = new THREE.Vector3(Math.sin(headingRad), 0, -Math.cos(headingRad));
  const pos = new THREE.Vector3(flight.x, flight.y, flight.z).addScaledVector(forward, -14);
  pos.y += 5;
  rig.smoothPos.copy(pos);
  rig.smoothLook.set(flight.x, flight.y + 1, flight.z).addScaledVector(forward, 26);
  rig.camera.position.copy(rig.smoothPos);
  rig.camera.lookAt(rig.smoothLook);
}
