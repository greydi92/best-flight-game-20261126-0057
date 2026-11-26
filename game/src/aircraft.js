// SKYHARBOUR — aircraft: builds the visible aeroplane from primitives, one
// per fleet type, with a spinning propeller, nav lights, landing light and
// gear that retracts. One file, one job: what the aircraft looks like.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, degToRad } from './utils.js';

/** Build a complete aircraft group for the fleet entry `spec`. */
export function buildAircraft(spec) {
  const g = new THREE.Group();
  g.name = `Aircraft_${spec.id}`;
  const body = new THREE.MeshLambertMaterial({ color: spec.colour });
  const trim = new THREE.MeshLambertMaterial({ color: spec.trim });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const glass = new THREE.MeshPhongMaterial({
    color: 0x9fc8e8, shininess: 140, specular: 0xffffff, transparent: true, opacity: 0.85,
  });
  const metal = new THREE.MeshPhongMaterial({ color: 0xc8ccd2, shininess: 90, specular: 0x888888 });

  // Fuselage: a stretched, tapered body from a cylinder plus a nose cone.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 7.2, 12), body);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.4;
  g.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.6, 12), trim);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.6 - 0.8 + 0.4; // nose points forward (-Z)
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.8, 12), trim);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 4.0 + 0.9;
  g.add(tail);

  // Canopy: a flattened half-sphere over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 0.62, 1.7);
  canopy.position.set(0, 0.45, -0.9);
  canopy.name = 'canopy';
  g.add(canopy);

  // Main wing: low wing for the racer, high wing for the bush plane.
  const highWing = spec.id === 'albatross' || spec.id === 'heron';
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.22, 2.1), trim);
  wing.position.set(0, highWing ? 0.85 : -0.25, -0.4);
  g.add(wing);
  // Wing tips in the body colour.
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.26, 2.0), body);
    tip.position.set(side * 5.9, highWing ? 0.85 : -0.25, -0.4);
    g.add(tip);
    // Wingtip nav lights: red left, green right.
    const navMat = new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2222 : 0x22ff44 });
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), navMat);
    nav.position.set(side * 6.3, highWing ? 0.85 : -0.25, -0.4);
    nav.name = side < 0 ? 'navRed' : 'navGreen';
    g.add(nav);
  }

  // Tailplane and fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.3), trim);
  tailplane.position.set(0, 0.15, 4.6);
  g.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.9, 1.7), body);
  fin.position.set(0, 0.95, 4.7);
  g.add(fin);
  // Registration letters on the fin, in white.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 1.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  stripe.position.set(0, 1.35, 4.7);
  g.add(stripe);

  // Propeller: hub plus two blades, spun by the animation loop.
  const prop = new THREE.Group();
  prop.name = 'propeller';
  prop.position.set(0, 0, -4.55);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), metal);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x1c1c20 });
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.6, 0.1), bladeMat);
    blade.rotation.z = a;
    blade.position.y = 0;
    blade.name = 'propBlade';
    prop.add(blade);
  }
  // A translucent disc appears at high rpm so the prop reads as spinning.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 24),
    new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  disc.name = 'propDisc';
  prop.add(disc);
  g.add(prop);

  // Landing gear: two main legs and a tail wheel, hidden when retracted.
  const gear = new THREE.Group();
  gear.name = 'gear';
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), dark);
    leg.position.set(side * 0.9, -0.9, -0.6);
    leg.rotation.z = side * 0.25;
    gear.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.05, -1.35, -0.6);
    gear.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.75, 4.3);
  gear.add(tailWheel);
  g.add(gear);

  // Landing light under the left wing, and a belly beacon.
  const landingLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  );
  landingLight.position.set(-2.4, -0.4, -1.2);
  landingLight.name = 'landingLight';
  g.add(landingLight);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3333 }),
  );
  beacon.position.set(0, -0.85, 1.2);
  beacon.name = 'beacon';
  g.add(beacon);

  // Floats for the amphibian, skis and cargo pods for the heavy lifter.
  if (spec.id === 'heron') {
    for (const side of [-1, 1]) {
      const float = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 5.4, 8), trim);
      float.rotation.x = Math.PI / 2;
      float.position.set(side * 1.15, -1.55, -0.4);
      g.add(float);
    }
  }
  if (spec.id === 'condor') {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 3.4), trim);
    pod.position.set(0, -1.1, 0.6);
    g.add(pod);
  }
  if (spec.id === 'falcon') {
    // Racing stripes along the fuselage.
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 6.4), stripeMat);
    s.position.set(0.88, 0.25, 0.4);
    g.add(s);
    const s2 = s.clone();
    s2.position.x = -0.88;
    g.add(s2);
  }

  // Scale the whole aircraft to a believable 10 m span in world units.
  g.scale.setScalar(1.15);
  // A cockpit instrument panel: built once, shown only in cockpit view.
  // All faces are unlit materials, so the dials read as back-lit instruments.
  const panel = buildCockpitPanel();
  panel.name = 'cockpitPanel';
  panel.visible = false;
  g.add(panel);

  return g;
}

/** Spin the propeller and blink the beacon from flight state. */
export function animateAircraft(group, state, dt, elapsed) {
  const prop = group.getObjectByName('propeller');
  if (prop) {
    const rpm = state.engineOn ? 4 + state.throttle * 46 : 0;
    prop.rotation.z -= rpm * dt;
    const disc = prop.getObjectByName('propDisc');
    if (disc) {
      disc.material.opacity = state.engineOn ? Math.min(0.15, state.throttle * 0.18) : 0;
    }
  }
  const beacon = group.getObjectByName('beacon');
  if (beacon) {
    const on = Math.sin(elapsed * 6) > 0;
    beacon.material.color.setHex(on ? 0xff3333 : 0x441111);
  }
  const gear = group.getObjectByName('gear');
  if (gear) gear.visible = state.gearDown !== false;
  const panel = group.getObjectByName('cockpitPanel');
  if (panel && panel.visible) updateCockpitPanel(panel, state);
}

/**
 * Cockpit view: hide the canopy glass and the prop blades (a real pilot sees
 * a faint spinning disc, not a frozen blade across the windscreen), so the
 * camera looking over the nose sees the valley, not the inside of the canopy.
 */
export function setCockpitView(group, cockpit) {
  const canopy = group.getObjectByName('canopy');
  if (canopy) canopy.visible = !cockpit;
  const prop = group.getObjectByName('propeller');
  if (prop) {
    prop.children.forEach((child) => {
      if (child.name === 'propBlade') child.visible = !cockpit;
    });
  }
  const panel = group.getObjectByName('cockpitPanel');
  if (panel) panel.visible = cockpit;
}

/**
 * Cockpit instrument panel: a 3D dashboard fixed to the airframe, visible
 * only in cockpit view. All faces use unlit materials, so the dials read as
 * back-lit instruments — the bounty asks for "instruments lit" and the old
 * cockpit view had none. Gauges: artificial horizon (rolls/pitches with the
 * aircraft), airspeed, altimeter, heading, fuel bar, gear light.
 */
function buildCockpitPanel() {
  const panel = new THREE.Group();
  panel.position.set(0, 1.12, -3.1);
  panel.scale.setScalar(0.8);
  panel.rotation.x = -0.28; // lean back so the face tilts up at the pilot
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.6, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x16191f }),
  );
  panel.add(backing);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(2.32, 0.05, 0.11),
    new THREE.MeshBasicMaterial({ color: 0x3a3f4a }),
  );
  trim.position.y = 0.3;
  panel.add(trim);

  // --- Artificial horizon: blue sky / brown ground halves that roll and
  // pitch with the aircraft, behind a fixed white ring and cross marker.
  const horizon = new THREE.Group();
  horizon.position.set(-0.8, 0.02, 0.06);
  const hFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.19, 28),
    new THREE.MeshBasicMaterial({ color: 0x0d1420 }),
  );
  horizon.add(hFace);
  const hInner = new THREE.Group();
  hInner.name = 'panelHorizon';
  hInner.position.z = 0.002; // in front of the face: coplanar discs z-fight
  const sky = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 24, 0, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x3f7fc4 }),
  );
  const groundHalf = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 24, Math.PI, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x7a5a34 }),
  );
  hInner.add(sky);
  hInner.add(groundHalf);
  horizon.add(hInner);
  const hRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.015, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xd8d8d8 }),
  );
  hRing.position.z = 0.004;
  horizon.add(hRing);
  const hMarker = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.018, 0.004),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  hMarker.position.z = 0.006;
  horizon.add(hMarker);
  panel.add(horizon);

  // --- Round dials: airspeed, altimeter, heading.
  panel.add(makeDial(-0.28, 0.02, 'panelAirspeed', 0xffc21c));
  panel.add(makeDial(0.22, 0.02, 'panelAltimeter', 0xffffff));
  panel.add(makeDial(0.68, 0.02, 'panelHeading', 0x7dd8ff));

  // --- Fuel bar: green fill that shrinks and turns red when low.
  const fuelBg = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.44, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x0d1420 }),
  );
  fuelBg.position.set(1.02, 0.02, 0.06);
  panel.add(fuelBg);
  const fuelGeo = new THREE.BoxGeometry(0.06, 0.4, 0.024);
  fuelGeo.translate(0, 0.2, 0); // origin at the bottom: scale.y grows upward
  const fuelFill = new THREE.Mesh(fuelGeo, new THREE.MeshBasicMaterial({ color: 0x37d67a }));
  fuelFill.name = 'panelFuel';
  fuelFill.position.set(1.02, -0.18, 0.06);
  panel.add(fuelFill);

  // --- Gear light: green when the gear is down, red when up.
  const gearLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x37d67a }),
  );
  gearLight.name = 'panelGearLight';
  gearLight.position.set(-0.8, -0.25, 0.06);
  panel.add(gearLight);

  return panel;
}

/** One round gauge: dark face, white rim, tick marks, a coloured needle. */
function makeDial(cx, cy, needleName, needleColour) {
  const g = new THREE.Group();
  g.position.set(cx, cy, 0.06);
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.15, 28),
    new THREE.MeshBasicMaterial({ color: 0x0d1420 }),
  );
  g.add(face);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.012, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xd8d8d8 }),
  );
  g.add(ring);
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.03, 0.004),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    tick.position.set(Math.sin(a) * 0.125, Math.cos(a) * 0.125, 0.004);
    tick.rotation.z = -a;
    g.add(tick);
  }
  const needle = new THREE.Group();
  needle.name = needleName;
  needle.position.z = 0.006;
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.11, 0.004),
    new THREE.MeshBasicMaterial({ color: needleColour }),
  );
  blade.position.y = 0.055;
  needle.add(blade);
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  hub.position.z = 0.004;
  needle.add(hub);
  g.add(needle);
  return g;
}

/** Drive the panel gauges from live flight state. Needles sweep -120..+120°. */
function updateCockpitPanel(panel, state) {
  const sweep = (v, max) => degToRad(120) - (clamp(v, 0, max) / max) * degToRad(240);
  const horizon = panel.getObjectByName('panelHorizon');
  if (horizon) {
    horizon.rotation.z = -degToRad(state.roll || 0);
    horizon.position.y = clamp(state.pitch || 0, -20, 20) * 0.004;
  }
  const asp = panel.getObjectByName('panelAirspeed');
  if (asp) asp.rotation.z = sweep(state.airspeedKmh || 0, 400);
  const alt = panel.getObjectByName('panelAltimeter');
  if (alt) alt.rotation.z = sweep(state.y || 0, 2600);
  const hdg = panel.getObjectByName('panelHeading');
  if (hdg) hdg.rotation.z = -degToRad(state.heading || 0);
  const fuel = panel.getObjectByName('panelFuel');
  if (fuel) {
    const maxFuel = state.spec ? state.spec.fuelKg : 180;
    const f = clamp((state.fuelKg || 0) / maxFuel, 0, 1);
    fuel.scale.y = Math.max(0.02, f);
    fuel.material.color.setHex(f < 0.2 ? 0xff4d4d : 0x37d67a);
  }
  const gear = panel.getObjectByName('panelGearLight');
  if (gear) gear.material.color.setHex(state.gearDown ? 0x37d67a : 0xff4d4d);
}
