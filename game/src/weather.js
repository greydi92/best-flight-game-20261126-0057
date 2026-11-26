// SKYHARBOUR — weather and sky: sun, moon, stars, clouds, rain and fog.
// One file, one job: the sky dome, the lighting rig and the weather visuals
// that make the same valley read differently at dawn, noon and in a storm.

import * as THREE from '../vendor/three.module.min.js';
import { WORLD } from './config.js';
import { clamp, lerp, mulberry32 } from './utils.js';

/** Create the sky dome, lights and cloud field. Returns the weather rig. */
export function createSky(scene) {
  const rig = {
    sun: new THREE.DirectionalLight(0xfff2dd, 2.4),
    hemi: new THREE.HemisphereLight(0xbfd9ff, 0x5a6b4a, 0.9),
    ambient: new THREE.AmbientLight(0xffffff, 0.25),
    skyMesh: null,
    stars: null,
    clouds: [],
    cloudGroup: new THREE.Group(),
    rain: null,
    rainPoints: null,
    moon: null,
    fogColour: new THREE.Color(0xbfd9ee),
  };
  rig.sun.castShadow = false;
  scene.add(rig.sun);
  scene.add(rig.sun.target);
  scene.add(rig.hemi);
  scene.add(rig.ambient);

  // Sky dome: a big sphere with a vertex-coloured gradient, BackSide.
  const skyGeo = new THREE.SphereGeometry(9000, 24, 16);
  const skyPos = skyGeo.attributes.position;
  const skyColours = new Float32Array(skyPos.count * 3);
  for (let i = 0; i < skyPos.count; i += 1) {
    const y = skyPos.getY(i) / 9000; // -1 bottom, 1 top
    const t = clamp(y * 0.5 + 0.5, 0, 1);
    // Horizon pale, zenith deep blue; store as a gradient the shader-free
    // material reads through vertex colours.
    const r = lerp(0.85, 0.18, t);
    const g = lerp(0.88, 0.42, t);
    const b = lerp(0.92, 0.78, t);
    skyColours[i * 3] = r;
    skyColours[i * 3 + 1] = g;
    skyColours[i * 3 + 2] = b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColours, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  rig.skyMesh = new THREE.Mesh(skyGeo, skyMat);
  rig.skyMesh.name = 'SkyDome';
  rig.skyMesh.renderOrder = -10;
  scene.add(rig.skyMesh);

  // Sun disc and moon disc, hung on the dome.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(220, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }),
  );
  sunDisc.name = 'sunDisc';
  rig.skyMesh.add(sunDisc);
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(110, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8ecf2, fog: false }),
  );
  moon.name = 'moonDisc';
  rig.moon = moon;
  rig.skyMesh.add(moon);

  // Stars: points that fade in at night.
  const starCount = 900;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const rng = mulberry32(99);
  for (let i = 0; i < starCount; i += 1) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(rng() * 0.85 + 0.08);
    const r = 8600;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  rig.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 14, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
  }));
  scene.add(rig.stars);

  // Clouds: billboarded puffs in groups, drifting with the wind.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 42; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 4 + Math.floor(rng() * 4);
    for (let p = 0; p < puffs; p += 1) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      const s = 60 + rng() * 90;
      puff.scale.set(s, s * 0.38, s * 0.7);
      puff.position.set((rng() - 0.5) * 260, (rng() - 0.5) * 26, (rng() - 0.5) * 160);
      cloud.add(puff);
    }
    cloud.position.set((rng() * 2 - 1) * 5600, 700 + rng() * 500, (rng() * 2 - 1) * 5600);
    cloud.userData.speed = 2 + rng() * 4;
    rig.clouds.push(cloud);
    rig.cloudGroup.add(cloud);
  }
  scene.add(rig.cloudGroup);

  // Rain: a points field around the aircraft, only visible in the storm.
  const rainCount = 2400;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i += 1) {
    rainPos[i * 3] = (rng() * 2 - 1) * 120;
    rainPos[i * 3 + 1] = rng() * 90;
    rainPos[i * 3 + 2] = (rng() * 2 - 1) * 120;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  rig.rainPoints = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0xaaccee, size: 0.55, transparent: true, opacity: 0, sizeAttenuation: true,
  }));
  rig.rainPoints.name = 'Rain';
  scene.add(rig.rainPoints);

  scene.fog = new THREE.Fog(0xbfd9ee, 2500, 9500);
  return rig;
}

/**
 * Update sun position, sky colours, fog, clouds and rain for the current
 * time of day and weather. `hour` is 0..24; `follow` is the aircraft
 * position the sky dome and rain follow.
 */
export function updateSky(rig, hour, weather, follow, dt, elapsed) {
  // Sun angle: rises at 6, sets at 20, below the horizon at night.
  const sunAngle = ((hour - 6) / 14) * Math.PI; // 0 at dawn, PI at dusk
  const sunElev = Math.sin(sunAngle);
  const sunAzim = Math.cos(sunAngle);
  const dayFactor = clamp(sunElev * 2.2 + 0.25, 0, 1);
  const duskFactor = clamp(1 - Math.abs(sunElev) * 3, 0, 1) * (hour > 6 && hour < 20 ? 1 : 0);

  // Position the sun disc on the dome and the directional light with it.
  const sunDir = new THREE.Vector3(sunAzim * 0.7, Math.max(sunElev, -0.25), 0.55).normalize();
  const sunDisc = rig.skyMesh.getObjectByName('sunDisc');
  if (sunDisc) {
    sunDisc.position.copy(sunDir).multiplyScalar(8800);
    sunDisc.lookAt(0, 0, 0);
    sunDisc.material.color.setHex(duskFactor > 0.4 ? 0xff9a4d : 0xfff6c8);
    sunDisc.visible = sunElev > -0.08;
  }
  if (rig.moon) {
    const moonDir = new THREE.Vector3(-sunAzim * 0.6, Math.max(-sunElev, 0.12), -0.6).normalize();
    rig.moon.position.copy(moonDir).multiplyScalar(8800);
    rig.moon.lookAt(0, 0, 0);
    rig.moon.visible = sunElev < 0.12;
  }
  rig.sun.position.copy(sunDir).multiplyScalar(3000).add(new THREE.Vector3(follow.x, follow.y, follow.z));
  rig.sun.target.position.set(follow.x, 0, follow.z);
  rig.sun.intensity = 0.25 + dayFactor * 2.3;
  rig.sun.color.setHex(duskFactor > 0.5 ? 0xffb27a : 0xfff2dd);
  rig.hemi.intensity = 0.25 + dayFactor * 0.7;
  rig.ambient.intensity = 0.12 + dayFactor * 0.18;

  // Sky gradient colours shift with the time of day.
  const skyPos = rig.skyMesh.geometry.attributes.position;
  const skyColours = rig.skyMesh.geometry.attributes.color;
  for (let i = 0; i < skyPos.count; i += 1) {
    const y = skyPos.getY(i) / 9000;
    const t = clamp(y * 0.5 + 0.5, 0, 1);
    let top, horizon;
    if (dayFactor > 0.6) { top = [0.18, 0.42, 0.78]; horizon = [0.85, 0.88, 0.92]; }
    else if (duskFactor > 0.3) { top = [0.25, 0.2, 0.45]; horizon = [1.0, 0.55, 0.3]; }
    else { top = [0.02, 0.04, 0.12]; horizon = [0.1, 0.13, 0.25]; }
    skyColours.setXYZ(i,
      lerp(horizon[0], top[0], t),
      lerp(horizon[1], top[1], t),
      lerp(horizon[2], top[2], t));
  }
  skyColours.needsUpdate = true;
  if (rig.stars) rig.stars.material.opacity = clamp(1 - dayFactor * 1.6, 0, 0.9);

  // Fog: thicker in cloud and rain, tinted by the sky.
  const fogNear = 2500 * weather.visibility;
  const fogFar = 9500 * weather.visibility;
  rig.skyMesh.material.fog = false;
  if (rig.skyMesh.parent && rig.skyMesh.parent.fog) {
    rig.skyMesh.parent.fog.near = fogNear;
    rig.skyMesh.parent.fog.far = fogFar;
    rig.skyMesh.parent.fog.color.setRGB(
      lerp(0.75, 0.18, 1 - dayFactor) + duskFactor * 0.2,
      lerp(0.85, 0.42, 1 - dayFactor),
      lerp(0.93, 0.78, 1 - dayFactor),
    );
  }

  // Clouds drift with the wind and thicken with the cloud cover.
  const cloudVisible = Math.round(42 * (0.25 + weather.cloud * 0.75));
  for (let i = 0; i < rig.clouds.length; i += 1) {
    const cloud = rig.clouds[i];
    cloud.visible = i < cloudVisible;
    cloud.position.x += (weather.windSpeed * 0.9 + cloud.userData.speed) * dt;
    cloud.position.z += weather.windSpeed * 0.25 * dt;
    if (cloud.position.x > 6200) cloud.position.x = -6200;
    if (cloud.position.z > 6200) cloud.position.z = -6200;
    const grey = 1 - weather.cloud * 0.45;
    cloud.children.forEach((puff) => {
      puff.material = puff.material; // shared material; tint once below
    });
    cloud.traverse((child) => {
      if (child.isMesh) child.material.opacity = 0.55 + weather.cloud * 0.35;
    });
    void grey;
  }

  // Rain falls around the aircraft in the storm.
  if (rig.rainPoints) {
    rig.rainPoints.position.set(follow.x, follow.y - 10, follow.z);
    rig.rainPoints.material.opacity = weather.rain * 0.75;
    const pos = rig.rainPoints.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      let y = pos.getY(i) - dt * 55;
      if (y < -10) y = 85;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  // The sky dome follows the aircraft so the horizon never runs out.
  rig.skyMesh.position.set(follow.x, 0, follow.z);
  if (rig.stars) rig.stars.position.set(follow.x, 0, follow.z);
}
