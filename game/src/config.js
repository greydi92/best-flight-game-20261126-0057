// SKYHARBOUR — configuration: the world, the fleet, the airfields and the missions.
// One file, one job: every number the game tunes lives here, so balance changes
// never touch the flight model, the renderer or the mission logic.
// Units: metres, seconds, kilometres per hour, degrees. North is -Z, east is +X.

export const WORLD = {
  name: 'Skyharbour Valley',
  size: 12000, // playable square, metres across
  seaLevel: 0,
  gravity: 9.81,
  airDensitySea: 1.225,
  maxAltitude: 2600,
  groundCeiling: 2400,
  startFuelKg: 220,
  fuelBurnCruise: 0.55, // kg per second at full throttle, scaled by throttle
  fuelBurnIdle: 0.08,
  crashSpeedKmh: 260, // hitting terrain above this speed is always fatal
  hardLandingVs: -6.5, // vertical speed (m/s) that damages the gear
  gearDamageVs: -11, // vertical speed that breaks the aircraft on touchdown
  repairCostPerDamage: 12, // score points lost per damage point on landing
};

export const TIME = {
  step: 1 / 60,
  dayLengthSeconds: 600, // a full day/night cycle while free-flying
  dawnHour: 6.5,
  duskHour: 19.0,
};

// ------------
// Fleet: six original aircraft, each with a distinct job and feel.
// Handling numbers are multipliers on the base flight model in physics.js.
// ------------
export const AIRCRAFT = [
  {
    id: 'kestrel',
    name: 'Kestrel S-2',
    role: 'Trainer — forgiving, slow, sips fuel',
    maxSpeedKmh: 210, cruiseKmh: 150, climbMs: 5.5,
    turnRate: 1.15, rollRate: 2.4, pitchRate: 1.1,
    fuelKg: 220, fuelBurn: 0.8, damageResist: 1.25,
    stallKmh: 78, price: 0, colour: 0xd94f30, trim: 0x2e4a6b,
    blurb: 'The valley trainer. Gentle stall, honest rudder, room for mistakes.',
  },
  {
    id: 'merlin',
    name: 'Merlin M-4',
    role: 'Mail plane — fast, long legs, light on the stick',
    maxSpeedKmh: 310, cruiseKmh: 230, climbMs: 8.0,
    turnRate: 1.0, rollRate: 2.0, pitchRate: 1.0,
    fuelKg: 300, fuelBurn: 1.0, damageResist: 1.0,
    stallKmh: 95, price: 1200, colour: 0x2f6fd9, trim: 0xf2f2f2,
    blurb: 'The postman of the valley. Carries the mail through weather that grounds others.',
  },
  {
    id: 'albatross',
    name: 'Albatross A-9',
    role: 'Bush plane — short strips, big tyres, climbs like a goat',
    maxSpeedKmh: 190, cruiseKmh: 140, climbMs: 7.5,
    turnRate: 1.25, rollRate: 2.6, pitchRate: 1.25,
    fuelKg: 260, fuelBurn: 0.9, damageResist: 1.4,
    stallKmh: 62, price: 2400, colour: 0x3f8f4f, trim: 0xf5e6c8,
    blurb: 'Built for the mountain strips. Lands where the map says there is no runway.',
  },
  {
    id: 'falcon',
    name: 'Falcon F-7',
    role: 'Racer — twitchy, thirsty, quickest through the rings',
    maxSpeedKmh: 390, cruiseKmh: 300, climbMs: 11.0,
    turnRate: 1.35, rollRate: 3.4, pitchRate: 1.3,
    fuelKg: 180, fuelBurn: 1.5, damageResist: 0.8,
    stallKmh: 118, price: 4800, colour: 0xe8b400, trim: 0x1c1c22,
    blurb: 'A racing thoroughbred. Rewards a steady hand, punishes a greedy throttle.',
  },
  {
    id: 'heron',
    name: 'Heron H-3',
    role: 'Amphibian — floats on the lake, wheels on the grass',
    maxSpeedKmh: 230, cruiseKmh: 165, climbMs: 6.0,
    turnRate: 1.05, rollRate: 2.1, pitchRate: 1.0,
    fuelKg: 280, fuelBurn: 0.95, damageResist: 1.1,
    stallKmh: 84, price: 3600, colour: 0x7fb3c8, trim: 0x274156,
    blurb: 'Lands on water as happily as on grass. The lake is its second runway.',
  },
  {
    id: 'condor',
    name: 'Condor C-12',
    role: 'Heavy lifter — slow, steady, carries the big loads',
    maxSpeedKmh: 260, cruiseKmh: 190, climbMs: 5.0,
    turnRate: 0.8, rollRate: 1.5, pitchRate: 0.85,
    fuelKg: 420, fuelBurn: 1.1, damageResist: 1.5,
    stallKmh: 102, price: 6000, colour: 0x8a6d4b, trim: 0x3a3a3a,
    blurb: 'The valley freighter. Takes off heavy, lands heavier, never hurries.',
  },
];

// ------------
// Airfields: eight strips scattered across the valley. Each is a real place
// the pilot can take off from, land on and be scored at.
// ------------
export const AIRFIELDS = [
  { id: 'harbour', name: 'Harbour Field', x: 0, z: 600, heading: 0, length: 900, width: 46, surface: 'asphalt', elevation: 42, tower: true },
  { id: 'mill', name: 'Mill Crossing', x: -2600, z: -900, heading: 28, length: 620, width: 34, surface: 'grass', elevation: 88, tower: false },
  { id: 'lakeside', name: 'Lakeside Strip', x: 3100, z: -1500, heading: -14, length: 700, width: 38, surface: 'grass', elevation: 55, tower: false },
  { id: 'northpass', name: 'North Pass', x: -900, z: -3800, heading: 62, length: 540, width: 30, surface: 'gravel', elevation: 310, tower: false },
  { id: 'quarry', name: 'Quarry Flat', x: 3600, z: 2400, heading: -48, length: 660, width: 36, surface: 'gravel', elevation: 140, tower: false },
  { id: 'southridge', name: 'South Ridge', x: -3400, z: 2900, heading: 8, length: 580, width: 32, surface: 'grass', elevation: 260, tower: false },
  { id: 'island', name: 'Gull Island', x: 4300, z: -3600, heading: 90, length: 480, width: 28, surface: 'sand', elevation: 12, tower: false },
  { id: 'observatory', name: 'Observatory Top', x: 900, z: -4600, heading: -70, length: 420, width: 26, surface: 'gravel', elevation: 520, tower: false },
];

// ------------
// Missions: seven sorties with different goals. `kind` drives the objective
// logic in missions.js; `par` is the target time in seconds for a gold medal.
// ------------
export const MISSIONS = [
  {
    id: 'first-solo', name: 'First Solo', kind: 'circuit', aircraft: 'kestrel',
    from: 'harbour', brief: 'Take off from Harbour Field, fly one full circuit and land on the same runway. Gentle turns, gentle throttle.',
    par: 240, reward: 500, weather: 'calm', timeOfDay: 9.0,
    tips: ['Rotate at 95 km/h.', 'Keep the ball centred in turns.', 'Flare at 10 m and let her settle.'],
  },
  {
    id: 'ring-run', name: 'Ring Run', kind: 'rings', aircraft: 'falcon',
    from: 'harbour', rings: 12, brief: 'Twelve glowing rings over the valley, in order, against the clock. Smooth lines beat brute speed.',
    par: 210, reward: 1200, weather: 'breeze', timeOfDay: 11.0,
    tips: ['Cut the corners, not the rings.', 'Full throttle only on the straights.', 'A missed ring costs 8 seconds.'],
  },
  {
    id: 'mountain-rescue', name: 'Mountain Rescue', kind: 'rescue', aircraft: 'albatross',
    from: 'mill', brief: 'A hiker is stranded on the North Pass ridge. Land on the gravel strip, pick them up, and bring them home to Harbour Field.',
    par: 420, reward: 2000, weather: 'gusty', timeOfDay: 15.0,
    tips: ['Approach uphill into the wind.', 'Short-field technique: full flaps, slow and steep.', 'The ridge wind will try to push you sideways.'],
  },
  {
    id: 'mail-run', name: 'Mail Run', kind: 'delivery', aircraft: 'merlin',
    from: 'harbour', stops: ['mill', 'lakeside', 'quarry'], brief: 'Three mail drops before the evening post closes: Mill Crossing, Lakeside, Quarry Flat. Land at each, drop the bag, move on.',
    par: 540, reward: 1800, weather: 'breeze', timeOfDay: 16.5,
    tips: ['Plan the route: mill, then lakeside, then quarry.', 'Touch-and-go counts — you only need wheels down.', 'Watch the fuel gauge; the Merlin is thirsty at full chat.'],
  },
  {
    id: 'storm-crossing', name: 'Storm Crossing', kind: 'rings', aircraft: 'merlin',
    from: 'southridge', rings: 10, brief: 'Ten rings through a storm front over South Ridge. Rain, gusts and low cloud — the mail still flies.',
    par: 300, reward: 2200, weather: 'storm', timeOfDay: 17.5,
    tips: ['In gusts, fly the attitude, not the altitude.', 'Small corrections, early.', 'Never chase a ring you have already missed.'],
  },
  {
    id: 'island-hop', name: 'Island Hop', kind: 'delivery', aircraft: 'heron',
    from: 'lakeside', stops: ['island', 'harbour'], brief: 'Fly the Heron out to Gull Island, splash down on the lagoon, then hop back to Harbour Field. Water landings count double.',
    par: 480, reward: 1600, weather: 'calm', timeOfDay: 8.0,
    tips: ['Water landings want a flat, slow touchdown.', 'The lagoon is glassy at dawn — trust the altimeter.', 'Flaps down early over the water.'],
  },
  {
    id: 'grand-tour', name: 'Grand Tour', kind: 'tour', aircraft: 'condor',
    from: 'harbour', stops: ['mill', 'northpass', 'observatory', 'island', 'southridge', 'quarry', 'lakeside'], brief: 'The whole valley in one sortie: touch down at all seven outlying fields and come home. Fuel is the enemy, not the clock.',
    par: 1500, reward: 4000, weather: 'breeze', timeOfDay: 10.0,
    tips: ['Cruise at 190 km/h — the Condor sips fuel there.', 'Land, refuel, take off again.', 'Seven landings, one tank. Plan every litre.'],
  },
];

// ------------
// Weather presets: wind, gusts, cloud cover, rain, visibility.
// ------------
export const WEATHER = {
  calm: { label: 'Calm', windSpeed: 2, windDir: 200, gust: 0.5, cloud: 0.15, rain: 0, visibility: 1.0, turbulence: 0.05 },
  breeze: { label: 'Breeze', windSpeed: 6, windDir: 240, gust: 2.0, cloud: 0.35, rain: 0, visibility: 0.95, turbulence: 0.15 },
  gusty: { label: 'Gusty', windSpeed: 11, windDir: 300, gust: 6.0, cloud: 0.55, rain: 0, visibility: 0.85, turbulence: 0.45 },
  storm: { label: 'Storm', windSpeed: 17, windDir: 280, gust: 9.0, cloud: 0.9, rain: 0.8, visibility: 0.55, turbulence: 0.8 },
};

// Scoring: medals by par time, plus landing quality and fuel remaining.
export const SCORING = {
  gold: 1.0, silver: 1.25, bronze: 1.6,
  ringMissPenaltySeconds: 8,
  perfectLandingBonus: 250,
  goodLandingBonus: 120,
  hardLandingPenalty: 150,
  fuelBonusPerKg: 2,
  damagePenaltyPerPoint: 12,
  crashPenalty: 500,
};

export const CONTROLS = {
  throttleUp: ['ShiftLeft', 'ShiftRight', 'KeyW'],
  throttleDown: ['ControlLeft', 'KeyS'],
  pitchUp: ['ArrowDown', 'KeyK'],
  pitchDown: ['ArrowUp', 'KeyJ'],
  rollLeft: ['ArrowLeft', 'KeyA'],
  rollRight: ['ArrowRight', 'KeyD'],
  rudderLeft: ['KeyQ'],
  rudderRight: ['KeyE'],
  flaps: ['KeyF'],
  gear: ['KeyG'],
  brakes: ['KeyB'],
  camera: ['KeyC', 'KeyV'],
  pause: ['KeyP', 'Escape'],
  reset: ['KeyR'],
  mute: ['KeyM'],
  help: ['KeyH'],
};

export function aircraftById(id) {
  return AIRCRAFT.find((a) => a.id === id) || AIRCRAFT[0];
}
export function airfieldById(id) {
  return AIRFIELDS.find((a) => a.id === id) || AIRFIELDS[0];
}
export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || MISSIONS[0];
}
export function medalForTime(seconds, par) {
  if (seconds <= par * SCORING.gold) return 'gold';
  if (seconds <= par * SCORING.silver) return 'silver';
  if (seconds <= par * SCORING.bronze) return 'bronze';
  return 'none';
}
