// SKYHARBOUR — terrain: the valley itself. Procedural heightfield, a river,
// a lake, a town, forests, eight runways and the landmarks a pilot navigates
// by. One file, one job: everything the aircraft flies over or lands on.

import * as THREE from '../vendor/three.module.min.js';
import { AIRFIELDS, WORLD } from './config.js';
import { clamp, fbm2, hash2, lerp, mulberry32 } from './utils.js';

/**
 * Height of the ground in metres at world (x, z). The valley floor is flat
 * enough to fly low over; the rim rises into mountains. Runway areas are
 * flattened to their field elevation so landings read true.
 */
export function groundHeight(x, z) {
  const half = WORLD.size / 2;
  const edge = Math.max(Math.abs(x), Math.abs(z)) / half; // 0 centre, 1 rim
  // Rolling valley floor, with real hills to fly over and around.
  let h = 40 + fbm2(x * 0.00012 + 7.3, z * 0.00012 + 2.9, 4, 41) * 170;
  // A ridge line across the north, and a mountain wall on the rim.
  const northRidge = Math.max(0, 1 - Math.abs(z + 3800) / 1600) * 280;
  const rim = Math.pow(Math.max(0, edge - 0.72) / 0.28, 2) * 750;
  h += northRidge * 0.7 + rim;
  // The lake basin near Lakeside dips below the water line.
  const lakeD = Math.hypot(x - 3100, z + 1500);
  if (lakeD < 900) h = lerp(h, -6, 1 - lakeD / 900);
  // Flatten every airfield to its elevation so runways sit on the ground.
  for (const f of AIRFIELDS) {
    const dx = x - f.x;
    const dz = z - f.z;
    // Runway axis is (sin h, -cos h); across is (cos h, sin h).
    const along = Math.abs(dx * Math.sin((f.heading * Math.PI) / 180) - dz * Math.cos((f.heading * Math.PI) / 180));
    const across = Math.abs(dx * Math.cos((f.heading * Math.PI) / 180) + dz * Math.sin((f.heading * Math.PI) / 180));
    if (along < f.length / 2 + 260 && across < f.width / 2 + 200) {
      const t = Math.max(along / (f.length / 2 + 260), across / (f.width / 2 + 200));
      const w = 1 - Math.pow(Math.max(0, t), 2);
      h = lerp(h, f.elevation, w);
    }
  }
  return h;
}

/** Is (x, z) inside the lake (water landing surface)? */
export function isWater(x, z) {
  const lakeD = Math.hypot(x - 3100, z + 1500);
  if (lakeD < 780) return true;
  // The river runs south-west to north-east through the valley.
  const riverX = riverCentreX(z);
  if (Math.abs(x - riverX) < 42 && z > -4200 && z < 4200) return true;
  return false;
}

/** Centre line of the river at a given z. */
export function riverCentreX(z) {
  return 1500 * Math.sin(z * 0.00022) - 800 * Math.cos(z * 0.00011) + 400;
}

/** Height of the water surface at (x, z): the lake and the river. */
export function waterHeight(x, z) {
  return 2.5;
}

function colourForHeight(h, x, z, rng) {
  // Grass valley floor, darker forest patches, rock high up, snow on peaks.
  const forest = fbm2(x * 0.0006, z * 0.0006, 3, 77);
  let r, g, b;
  if (h > 700) { r = 0.82; g = 0.84; b = 0.88; } // snow
  else if (h > 380) { r = 0.42; g = 0.38; b = 0.34; } // rock
  else if (forest > 0.58) { r = 0.14; g = 0.30; b = 0.11; } // forest
  else if (h < 48) { r = 0.38; g = 0.50; b = 0.18; } // low meadow
  else { r = 0.30; g = 0.46; b = 0.15; } // grass
  // Subtle patch variation so the ground never looks flat-shaded.
  const v = 0.92 + hash2(Math.floor(x / 90), Math.floor(z / 90), 5) * 0.16;
  return [r * v, g * v, b * v];
}

/**
 * Build the terrain mesh plus all static ground features. Returns a group
 * and a `dispose` helper. `onProgress` is called with a 0..1 fraction.
 */
export function buildTerrain(scene, onProgress) {
  const group = new THREE.Group();
  group.name = 'SkyharbourTerrain';
  const rng = mulberry32(20261126);
  const half = WORLD.size / 2;
  const SEG = 200;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const [r, g, b] = colourForHeight(h, x, z, rng);
    colours[i * 3] = r;
    colours[i * 3 + 1] = g;
    colours[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = false;
  group.add(terrain);
  if (onProgress) onProgress(0.35);

  // --- Water: lake disc + river ribbon, both slightly transparent. ---
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x2e6f9e, transparent: true, opacity: 0.82, shininess: 120, specular: 0x99ccff,
  });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(780, 48), waterMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(3100, waterHeight(3100, -1500), -1500);
  group.add(lake);
  const riverPts = [];
  for (let z = -4200; z <= 4200; z += 120) {
    riverPts.push(new THREE.Vector3(riverCentreX(z), waterHeight(0, z), z));
  }
  const riverCurve = new THREE.CatmullRomCurve3(riverPts);
  const riverGeo = new THREE.TubeGeometry(riverCurve, 120, 40, 6, false);
  // Flatten the tube into a ribbon by scaling Y — cheaper than a custom strip.
  riverGeo.scale(1, 0.06, 1);
  const river = new THREE.Mesh(riverGeo, waterMat);
  group.add(river);

  // --- Runways, taxiways, windsocks and beacons for all eight fields. ---
  const windsocks = [];
  for (const f of AIRFIELDS) {
    const runway = makeRunway(f);
    group.add(runway);
    const sock = makeWindsock(f);
    group.add(sock);
    windsocks.push(sock);
    if (f.tower) {
      group.add(makeTower(f));
    }
  }
  if (onProgress) onProgress(0.6);

  // --- Harbour town: houses, a church spire, a market square. ---
  group.add(makeTown(rng));
  // --- Forests: instanced cones so thousands of trees cost one draw call. ---
  group.add(makeForest(rng));
  // --- Mountains: a few hero peaks with snow caps on the rim. ---
  group.add(makePeaks(rng));
  // --- Roads: pale ribbons joining the fields to the town. ---
  group.add(makeRoads());
  if (onProgress) onProgress(1);
  scene.add(group);
  return { group, windsocks };
}

function makeRunway(f) {
  const g = new THREE.Group();
  const rad = (f.heading * Math.PI) / 180;
  const surfaceColours = { asphalt: 0x3a3d42, grass: 0xb5d18a, gravel: 0x9a8f7a, sand: 0xd9c69a };
  const mat = new THREE.MeshLambertMaterial({ color: surfaceColours[f.surface] || 0x3a3d42 });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(f.width, f.length), mat);
  strip.rotation.x = -Math.PI / 2;
  strip.rotation.z = -rad;
  strip.position.set(f.x, f.elevation + 0.6, f.z);
  g.add(strip);
  // Centreline dashes and threshold bars, slightly above the strip.
  const markMat = new THREE.MeshBasicMaterial({ color: 0xf5f5e8 });
  const dashes = Math.floor(f.length / 90);
  for (let i = -dashes; i <= dashes; i += 1) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 26), markMat);
    d.rotation.x = -Math.PI / 2;
    d.rotation.z = -rad;
    const along = i * 90;
    // Runway axis is (sin h, -cos h).
    d.position.set(
      f.x + Math.sin(rad) * along,
      f.elevation + 0.8,
      f.z - Math.cos(rad) * along,
    );
    g.add(d);
  }
  // Threshold bars: wide white bars across the strip at both ends, so the
  // runway reads as a runway from final approach.
  for (const end of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(f.width * 0.82, 5), markMat);
    bar.rotation.x = -Math.PI / 2;
    bar.rotation.z = -rad;
    const along = end * (f.length / 2 - 8);
    bar.position.set(
      f.x + Math.sin(rad) * along,
      f.elevation + 0.85,
      f.z - Math.cos(rad) * along,
    );
    g.add(bar);
  }
  // PAPI lights beside the approach threshold: two red, two white.
  const papiColours = [0xff2a2a, 0xff2a2a, 0xffffff, 0xffffff];
  papiColours.forEach((col, k) => {
    const papi = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.6, 1.6),
      new THREE.MeshBasicMaterial({ color: col }),
    );
    const along = -f.length / 2 + 42;
    const across = f.width / 2 + 12 + k * 6;
    papi.position.set(
      f.x + Math.sin(rad) * along + Math.cos(rad) * across,
      f.elevation + 1.6,
      f.z - Math.cos(rad) * along + Math.sin(rad) * across,
    );
    g.add(papi);
  });
  // Approach light bar: five white lights stretching out past the threshold.
  const approachMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const approachGeo = new THREE.SphereGeometry(1.4, 6, 6);
  for (let k = 0; k < 5; k += 1) {
    const al = new THREE.Mesh(approachGeo, approachMat);
    const along = -f.length / 2 - 30 - k * 30;
    al.position.set(
      f.x + Math.sin(rad) * along,
      f.elevation + 1.4,
      f.z - Math.cos(rad) * along,
    );
    g.add(al);
  }
  // Runway edge lights: small emissive posts every 120 m.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  const lightGeo = new THREE.SphereGeometry(1.6, 6, 6);
  for (let i = -Math.floor(f.length / 2 / 120); i <= Math.floor(f.length / 2 / 120); i += 1) {
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(lightGeo, lightMat);
      const along = i * 120;
      const across = (f.width / 2 + 4) * side;
      light.position.set(
        f.x + Math.sin(rad) * along + Math.cos(rad) * across,
        f.elevation + 1.5,
        f.z - Math.cos(rad) * along + Math.sin(rad) * across,
      );
      g.add(light);
    }
  }
  return g;
}

function makeWindsock(f) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 9, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.y = 4.5;
  g.add(pole);
  const sockMat = new THREE.MeshLambertMaterial({ color: 0xff7a2a, side: THREE.DoubleSide });
  const sock = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.6, 8, 1, true), sockMat);
  sock.rotation.z = Math.PI / 2;
  sock.position.set(1.9, 8.6, 0);
  sock.name = 'sock';
  g.add(sock);
  g.position.set(f.x + 40, f.elevation, f.z + 40);
  g.userData.baseHeading = f.heading;
  return g;
}

function makeTower(f) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(10, 26, 10),
    new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }),
  );
  base.position.y = 13;
  g.add(base);
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(14, 6, 14),
    new THREE.MeshPhongMaterial({ color: 0x2e4a6b, shininess: 80 }),
  );
  cab.position.y = 29;
  g.add(cab);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4444 }),
  );
  beacon.position.y = 33;
  beacon.name = 'beacon';
  g.add(beacon);
  g.position.set(f.x - 60, f.elevation, f.z - 60);
  return g;
}

function makeTown(rng) {
  const g = new THREE.Group();
  g.name = 'HarbourTown';
  const wallCols = [0xd9c9a8, 0xc9b8a0, 0xe8ddc8, 0xb8a888];
  const roofCols = [0xa8442e, 0x7a3a2e, 0x8a6d4b, 0x5a6d8a];
  // A loose grid of houses around the town square, south of Harbour Field.
  for (let i = 0; i < 90; i += 1) {
    const gx = -520 + (i % 10) * 105 + (rng() - 0.5) * 40;
    const gz = 1250 + Math.floor(i / 10) * 95 + (rng() - 0.5) * 36;
    if (Math.hypot(gx - 0, gz - 1500) < 90) continue; // keep the square clear
    const w = 16 + rng() * 14;
    const d = 14 + rng() * 12;
    const h = 8 + rng() * 10;
    const house = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: wallCols[Math.floor(rng() * wallCols.length)] }),
    );
    house.position.set(gx, groundHeight(gx, gz) + h / 2, gz);
    house.rotation.y = (rng() - 0.5) * 0.4;
    g.add(house);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.72, 5 + rng() * 4, 4),
      new THREE.MeshLambertMaterial({ color: roofCols[Math.floor(rng() * roofCols.length)] }),
    );
    roof.position.set(gx, groundHeight(gx, gz) + h + 2.5, gz);
    roof.rotation.y = Math.PI / 4 + (rng() - 0.5) * 0.4;
    g.add(roof);
  }
  // Church spire on the square.
  const church = new THREE.Mesh(
    new THREE.BoxGeometry(18, 16, 26),
    new THREE.MeshLambertMaterial({ color: 0xe8ddc8 }),
  );
  church.position.set(0, groundHeight(0, 1500) + 8, 1500);
  g.add(church);
  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(7, 22, 4),
    new THREE.MeshLambertMaterial({ color: 0x5a6d8a }),
  );
  spire.position.set(0, groundHeight(0, 1500) + 27, 1500);
  spire.rotation.y = Math.PI / 4;
  g.add(spire);
  return g;
}

function makeForest(rng) {
  const count = 2600;
  const geo = new THREE.ConeGeometry(7, 22, 6);
  const mat = new THREE.MeshLambertMaterial({ color: 0x1e4d1a });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 12) {
    guard += 1;
    const x = (rng() * 2 - 1) * 5400;
    const z = (rng() * 2 - 1) * 5400;
    const h = groundHeight(x, z);
    if (h > 300 || h < 46) continue; // trees grow on the valley floor only
    if (isWater(x, z)) continue;
    let nearField = false;
    for (const f of AIRFIELDS) {
      if (Math.hypot(x - f.x, z - f.z) < f.length * 0.7) { nearField = true; break; }
    }
    if (nearField) continue;
    if (Math.abs(x) < 620 && z > 1150 && z < 2100) continue; // keep the town clear
    const s = 0.7 + rng() * 0.9;
    dummy.position.set(x, h + 10 * s, z);
    dummy.scale.set(s, s * (0.9 + rng() * 0.4), s);
    dummy.rotation.y = rng() * Math.PI * 2;
    dummy.updateMatrix();
    inst.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  inst.count = placed;
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

function makePeaks(rng) {
  const g = new THREE.Group();
  const peaks = [
    [-5000, -5000, 620], [5000, -4600, 560], [-5200, 4600, 520],
    [5200, 5000, 600], [0, -5400, 660], [-2600, -5200, 480],
  ];
  for (const [x, z, h] of peaks) {
    const rock = new THREE.Mesh(
      new THREE.ConeGeometry(1050 + rng() * 450, h, 7),
      new THREE.MeshLambertMaterial({ color: 0x5a5148, flatShading: true }),
    );
    rock.position.set(x, groundHeight(x, z) + h / 2 - 60, z);
    g.add(rock);
    const snow = new THREE.Mesh(
      new THREE.ConeGeometry(300 + rng() * 120, h * 0.3, 7),
      new THREE.MeshLambertMaterial({ color: 0xf2f5f8, flatShading: true }),
    );
    snow.position.set(x, groundHeight(x, z) + h - 60 - h * 0.15, z);
    g.add(snow);
  }
  return g;
}

function makeRoads() {
  const g = new THREE.Group();
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x8a8578 });
  const links = [
    [[0, 600], [0, 1250]], // Harbour Field to town
    [[0, 1500], [-2600, -900]],
    [[0, 1500], [3100, -1500]],
    [[0, 1500], [3600, 2400]],
    [[-2600, -900], [-900, -3800]],
  ];
  for (const [[x1, z1], [x2, z2]] of links) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, len), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
    const mx = (x1 + x2) / 2;
    const mz = (z1 + z2) / 2;
    road.position.set(mx, groundHeight(mx, mz) + 0.4, mz);
    g.add(road);
  }
  return g;
}

/** Point the windsocks into the wind and blink the tower beacon. */
export function animateTerrain(terrain, windDirDeg, elapsed) {
  for (const sock of terrain.windsocks) {
    const cone = sock.getObjectByName('sock');
    if (cone) cone.rotation.y = 0; // sock hangs along local +X; rotate group instead
    sock.rotation.y = ((-windDirDeg + 180) * Math.PI) / 180 + Math.sin(elapsed * 0.7) * 0.08;
  }
}
