// SKYHARBOUR — traffic: the valley is alive. AI mail planes fly the routes
// between fields, gliders circle the thermals, and flocks of birds cross the
// lake at dawn. One file, one job: ambient life that never interferes with
// the player's mission, but makes the sky feel shared.

import * as THREE from '../vendor/three.module.min.js';
import { AIRFIELDS } from './config.js';
import { buildAircraft } from './aircraft.js';
import { clamp, degToRad, mulberry32, wrapDegrees } from './utils.js';
import { groundHeight } from './terrain.js';

/** Create the traffic manager: 3 AI planes, 2 gliders, 2 bird flocks. */
export function createTraffic(scene) {
  const rng = mulberry32(777);
  const manager = { scene, planes: [], gliders: [], flocks: [], rng };
  const specs = [
    { colour: 0x8a2f2f, trim: 0xf2f2f2, id: 'traffic-a' },
    { colour: 0x2f5a8a, trim: 0xf2f2f2, id: 'traffic-b' },
    { colour: 0x4a7a3a, trim: 0xf5e6c8, id: 'traffic-c' },
  ];
  for (let i = 0; i < 3; i += 1) {
    const from = AIRFIELDS[Math.floor(rng() * AIRFIELDS.length)];
    let to = AIRFIELDS[Math.floor(rng() * AIRFIELDS.length)];
    if (to === from) to = AIRFIELDS[(AIRFIELDS.indexOf(from) + 3) % AIRFIELDS.length];
    const mesh = buildAircraft(specs[i]);
    mesh.scale.setScalar(1.0);
    scene.add(mesh);
    manager.planes.push({
      mesh, from, to,
      x: from.x, z: from.z,
      y: from.elevation + 320 + rng() * 260,
      heading: rng() * 360,
      speed: 42 + rng() * 14, // m/s
      phase: rng() * Math.PI * 2,
    });
  }
  // Gliders: silent, circling over the ridge thermals.
  for (let i = 0; i < 2; i += 1) {
    const glider = new THREE.Group();
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.14, 1.4),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    );
    glider.add(wing);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.2, 5.5, 8),
      new THREE.MeshLambertMaterial({ color: 0xd94f30 }),
    );
    body.rotation.x = Math.PI / 2;
    glider.add(body);
    scene.add(glider);
    manager.gliders.push({
      mesh: glider,
      cx: -1400 + i * 2600,
      cz: -2600 + i * 1200,
      cy: 900 + i * 150,
      radius: 220 + rng() * 120,
      angle: rng() * Math.PI * 2,
      speed: 0.09 + rng() * 0.03,
    });
  }
  // Bird flocks: small dark V shapes drifting over the lake.
  for (let i = 0; i < 2; i += 1) {
    const flock = new THREE.Group();
    const birdGeo = new THREE.ConeGeometry(0.5, 2.2, 4);
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (let b = 0; b < 9; b += 1) {
      const bird = new THREE.Mesh(birdGeo, birdMat);
      bird.rotation.x = -Math.PI / 2;
      bird.position.set((b % 3) * 4 - 4, Math.floor(b / 3) * -2.5, (b % 3) * 3);
      flock.add(bird);
    }
    scene.add(flock);
    manager.flocks.push({
      mesh: flock,
      x: 2600 + i * 900,
      z: -1200 - i * 500,
      y: 180 + i * 60,
      heading: 40 + i * 130,
      speed: 12 + i * 3,
      phase: rng() * Math.PI * 2,
    });
  }
  return manager;
}

/** Advance all traffic by dt seconds. */
export function updateTraffic(manager, dt, elapsed) {
  // AI mail planes: fly toward their destination, then pick a new one.
  for (const p of manager.planes) {
    const dx = p.to.x - p.x;
    const dz = p.to.z - p.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = (Math.atan2(dx, -dz) * 180) / Math.PI;
    const delta = wrapDegrees(wantHeading - p.heading);
    p.heading = wrapDegrees(p.heading + clamp(delta, -14 * dt, 14 * dt));
    const hr = degToRad(p.heading);
    p.x += Math.sin(hr) * p.speed * dt;
    p.z += -Math.cos(hr) * p.speed * dt;
    // Gentle altitude hunting toward cruise height.
    const targetY = p.to.elevation + 320 + Math.sin(elapsed * 0.2 + p.phase) * 30;
    p.y += clamp(targetY - p.y, -4 * dt, 4 * dt);
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.set(0, -degToRad(p.heading), degToRad(clamp(delta * 0.6, -18, 18)));
    const prop = p.mesh.getObjectByName('propeller');
    if (prop) prop.rotation.z -= dt * 30;
    if (dist < 500) {
      p.from = p.to;
      let next = AIRFIELDS[Math.floor(manager.rng() * AIRFIELDS.length)];
      if (next === p.from) next = AIRFIELDS[(AIRFIELDS.indexOf(next) + 4) % AIRFIELDS.length];
      p.to = next;
    }
  }
  // Gliders circle their thermal.
  for (const gl of manager.gliders) {
    gl.angle += gl.speed * dt;
    const x = gl.cx + Math.cos(gl.angle) * gl.radius;
    const z = gl.cz + Math.sin(gl.angle) * gl.radius;
    const heading = (Math.atan2(-Math.sin(gl.angle), -Math.cos(gl.angle)) * 180) / Math.PI;
    gl.mesh.position.set(x, gl.cy + Math.sin(elapsed * 0.3 + gl.angle) * 12, z);
    gl.mesh.rotation.set(0, -degToRad(heading), degToRad(18));
  }
  // Bird flocks drift and bob, turning slowly over the lake.
  for (const fl of manager.flocks) {
    fl.heading += Math.sin(elapsed * 0.1 + fl.phase) * 6 * dt;
    const hr = degToRad(fl.heading);
    fl.x += Math.sin(hr) * fl.speed * dt;
    fl.z += -Math.cos(hr) * fl.speed * dt;
    if (Math.abs(fl.x) > 5200 || Math.abs(fl.z) > 5200) fl.heading += 140;
    fl.mesh.position.set(fl.x, fl.y + Math.sin(elapsed * 2 + fl.phase) * 3, fl.z);
    fl.mesh.rotation.y = -degToRad(fl.heading);
    // Wing flap: the whole flock bobs together.
    fl.mesh.children.forEach((bird, i) => {
      bird.position.y = Math.sin(elapsed * 6 + i * 0.8) * 0.35;
    });
  }
}

/** Park one AI plane at an exact spot for a screenshot scene: it keeps
 * flying from there under the normal traffic rules, so the frame stays a
 * genuine render of the game's own code. */
export function stageTrafficPlane(manager, index, x, y, z, heading, speed) {
  const p = manager.planes[index];
  if (!p) return;
  p.x = x;
  p.y = y;
  p.z = z;
  p.heading = wrapDegrees(heading);
  p.speed = speed || 48;
  p.mesh.position.set(x, y, z);
  p.mesh.rotation.set(0, -degToRad(p.heading), 0);
}
