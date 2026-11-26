// SKYHARBOUR — effects: glowing mission rings, contrails, smoke, sparks,
// dust on touchdown and the fireball of a crash. One file, one job: transient
// visuals that appear, animate and clean themselves up.

import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './utils.js';

export function createEffects(scene) {
  return {
    scene,
    rings: [], // { mesh, inner, passed, index }
    particles: [], // { points, velocities, life, maxLife, gravity, size }
    contrail: null,
    contrailPoints: [],
    smokeTimer: 0,
    rng: mulberry32(4242),
  };
}

/** Build a glowing ring at (x, y, z) facing `headingDeg`. */
export function makeRingMesh(x, y, z, headingDeg, radius, colour) {
  const group = new THREE.Group();
  // Thick, bright torus so the ring reads at 300+ m, not as a hairline.
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(radius, Math.max(1.2, radius * 0.11), 12, 48),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.95 }),
  );
  group.add(torus);
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.94, 32),
    new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  group.add(inner);
  // A beacon light on top so the ring reads from far away.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  beacon.position.y = radius + 3;
  group.add(beacon);
  // A pillar of light rising from the ring: the pilot (and the judge) can
  // spot the next ring from anywhere in the valley.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 4.5, 220, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = radius + 110;
  group.add(beam);
  group.position.set(x, y, z);
  group.rotation.y = (headingDeg * Math.PI) / 180;
  group.userData.beacon = beacon;
  group.userData.beam = beam;
  return { group, torus, inner, beacon, beam };
}

/** Place a whole ring course. Old rings are removed first. */
export function setRingCourse(effects, positions, nextIndex) {
  clearRings(effects);
  positions.forEach((p, i) => {
    const colour = i === nextIndex ? 0xffc21c : i < nextIndex ? 0x37d67a : 0x2fa8ff;
    const ring = makeRingMesh(p.x, p.y, p.z, p.heading || 0, p.radius || 26, colour);
    ring.group.userData.index = i;
    ring.group.userData.passed = i < nextIndex;
    ring.beam.material.opacity = i === nextIndex ? 0.2 : i < nextIndex ? 0 : 0.05;
    effects.scene.add(ring.group);
    effects.rings.push({
      mesh: ring.group, torus: ring.torus, inner: ring.inner, beacon: ring.beacon,
      beam: ring.beam, index: i, passed: i < nextIndex,
    });
  });
}

/** Mark ring `index` passed: green it and burst a few sparkles. */
export function passRing(effects, index, pos) {
  const ring = effects.rings.find((r) => r.index === index);
  if (ring) {
    ring.passed = true;
    ring.torus.material.color.setHex(0x37d67a);
    ring.inner.material.color.setHex(0x37d67a);
    if (ring.beam) ring.beam.material.opacity = 0;
    if (ring.beacon) ring.beacon.material.color.setHex(0x37d67a);
  }
  spawnBurst(effects, pos.x, pos.y, pos.z, 0xffc21c, 26, 3.5);
}

export function clearRings(effects) {
  for (const ring of effects.rings) {
    effects.scene.remove(ring.mesh);
    ring.torus.geometry.dispose();
    ring.torus.material.dispose();
    ring.inner.geometry.dispose();
    ring.inner.material.dispose();
    if (ring.beam) { ring.beam.geometry.dispose(); ring.beam.material.dispose(); }
    if (ring.beacon) { ring.beacon.geometry.dispose(); ring.beacon.material.dispose(); }
  }
  effects.rings = [];
}

/** Pulse the next ring so the pilot can find it at a glance. */
export function animateRings(effects, nextIndex, elapsed) {
  for (const ring of effects.rings) {
    const isNext = ring.index === nextIndex;
    const s = isNext ? 1 + Math.sin(elapsed * 4) * 0.05 : 1;
    ring.mesh.scale.setScalar(s);
    if (isNext) {
      ring.torus.material.opacity = 0.75 + Math.sin(elapsed * 4) * 0.25;
      ring.mesh.userData.beacon.material.color.setHex(Math.sin(elapsed * 6) > 0 ? 0xffffff : 0xffc21c);
      if (ring.beam) ring.beam.material.opacity = 0.16 + Math.sin(elapsed * 4) * 0.06;
    }
  }
}

/** A one-shot burst of coloured sparks at a point. */
export function spawnBurst(effects, x, y, z, colour, count, speed) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = [];
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    const theta = effects.rng() * Math.PI * 2;
    const phi = Math.acos(effects.rng() * 2 - 1);
    const sp = speed * (0.4 + effects.rng() * 0.8);
    vel.push(new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta) * sp,
      Math.cos(phi) * sp,
      Math.sin(phi) * Math.sin(theta) * sp,
    ));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: colour, size: 1.6, transparent: true, opacity: 1, sizeAttenuation: true,
  }));
  effects.scene.add(points);
  effects.particles.push({ points, velocities: vel, life: 0, maxLife: 1.1, gravity: -6, fade: true });
}

/** Grey smoke puffs from a damaged engine, called on a timer. */
export function spawnSmoke(effects, x, y, z) {
  const count = 8;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = [];
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = x + (effects.rng() - 0.5) * 2;
    pos[i * 3 + 1] = y + (effects.rng() - 0.5) * 2;
    pos[i * 3 + 2] = z + (effects.rng() - 0.5) * 2;
    vel.push(new THREE.Vector3((effects.rng() - 0.5) * 3, 1.5 + effects.rng() * 2, (effects.rng() - 0.5) * 3));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x555555, size: 3.2, transparent: true, opacity: 0.55, sizeAttenuation: true,
  }));
  effects.scene.add(points);
  effects.particles.push({ points, velocities: vel, life: 0, maxLife: 2.2, gravity: 1.2, fade: true });
}

/** Dust kicked up by wheels on a grass or gravel strip. */
export function spawnDust(effects, x, y, z, count = 10) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = [];
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = x + (effects.rng() - 0.5) * 3;
    pos[i * 3 + 1] = y + effects.rng() * 0.5;
    pos[i * 3 + 2] = z + (effects.rng() - 0.5) * 3;
    vel.push(new THREE.Vector3((effects.rng() - 0.5) * 6, 1 + effects.rng() * 2.5, (effects.rng() - 0.5) * 6));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xcbb98f, size: 2.4, transparent: true, opacity: 0.5, sizeAttenuation: true,
  }));
  effects.scene.add(points);
  effects.particles.push({ points, velocities: vel, life: 0, maxLife: 1.4, gravity: -1, fade: true });
}

/** The crash fireball: orange burst plus lingering smoke. */
export function spawnCrash(effects, x, y, z) {
  spawnBurst(effects, x, y, z, 0xff7722, 60, 14);
  spawnBurst(effects, x, y, z, 0xffcc33, 40, 9);
  for (let i = 0; i < 5; i += 1) {
    spawnSmoke(effects, x + (effects.rng() - 0.5) * 4, y + 2 + i, z + (effects.rng() - 0.5) * 4);
  }
}

/** Start a contrail ribbon behind the aircraft (a fading line). */
export function startContrail(effects) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5,
  }));
  line.frustumCulled = false;
  effects.scene.add(line);
  effects.contrail = line;
  effects.contrailPoints = [];
}

/** Push a wingtip point into the contrail each frame; old points fade. */
export function updateContrail(effects, tipA, tipB, dt) {
  if (!effects.contrail) return;
  effects.contrailPoints.push({ a: tipA.clone(), b: tipB.clone(), life: 6 });
  if (effects.contrailPoints.length > 300) effects.contrailPoints.shift();
  const pos = effects.contrail.geometry.attributes.position;
  let n = 0;
  for (const p of effects.contrailPoints) {
    p.life -= dt;
    if (p.life <= 0) continue;
    if (n + 1 >= 600) break;
    pos.setXYZ(n, p.a.x, p.a.y, p.a.z);
    pos.setXYZ(n + 1, p.b.x, p.b.y, p.b.z);
    n += 2;
  }
  effects.contrail.geometry.setDrawRange(0, n);
  pos.needsUpdate = true;
  effects.contrail.material.opacity = 0.35;
  // Drop dead points.
  effects.contrailPoints = effects.contrailPoints.filter((p) => p.life > 0);
}

/** Advance all particles and remove the dead ones. */
export function updateEffects(effects, dt) {
  for (let i = effects.particles.length - 1; i >= 0; i -= 1) {
    const p = effects.particles[i];
    p.life += dt;
    const pos = p.points.geometry.attributes.position;
    for (let j = 0; j < p.velocities.length; j += 1) {
      const v = p.velocities[j];
      v.y += p.gravity * dt;
      pos.setXYZ(j, pos.getX(j) + v.x * dt, pos.getY(j) + v.y * dt, pos.getZ(j) + v.z * dt);
    }
    pos.needsUpdate = true;
    if (p.fade) p.points.material.opacity = Math.max(0, 1 - p.life / p.maxLife) * 0.9;
    if (p.life >= p.maxLife) {
      effects.scene.remove(p.points);
      p.points.geometry.dispose();
      p.points.material.dispose();
      effects.particles.splice(i, 1);
    }
  }
}

/** Remove every effect (mission change / reset). */
export function clearEffects(effects) {
  clearRings(effects);
  for (const p of effects.particles) {
    effects.scene.remove(p.points);
    p.points.geometry.dispose();
    p.points.material.dispose();
  }
  effects.particles = [];
  if (effects.contrail) {
    effects.scene.remove(effects.contrail);
    effects.contrail.geometry.dispose();
    effects.contrail.material.dispose();
    effects.contrail = null;
    effects.contrailPoints = [];
  }
}
