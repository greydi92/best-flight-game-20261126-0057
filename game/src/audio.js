// SKYHARBOUR — audio: every sound is synthesised with WebAudio, no files.
// One file, one job: engine drone, prop chop, wind rush, stall buffet, ring
// chimes, touchdown thump, crash, and a gentle music-box theme for the menus.

/** Create the audio engine. Call `unlock()` from a user gesture first. */
export function createAudio() {
  return {
    ctx: null,
    master: null,
    muted: false,
    unlocked: false,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    engineFilter: null,
    windSource: null,
    windGain: null,
    windFilter: null,
    musicNodes: [],
    musicTimer: null,
    musicOn: false,
    lastChime: 0,
  };
}

/** Build the AudioContext and the always-on engine/wind graph. */
export function unlockAudio(audio) {
  if (audio.unlocked) return true;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.9;
    audio.master.connect(audio.ctx.destination);

    // Engine: two detuned sawtooth oscillators through a low-pass filter.
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    audio.engineOsc2 = audio.ctx.createOscillator();
    audio.engineOsc2.type = 'square';
    audio.engineOsc2.frequency.value = 27.5;
    audio.engineFilter = audio.ctx.createBiquadFilter();
    audio.engineFilter.type = 'lowpass';
    audio.engineFilter.frequency.value = 420;
    audio.engineFilter.Q.value = 1.2;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(audio.engineFilter);
    audio.engineOsc2.connect(audio.engineFilter);
    audio.engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    audio.engineOsc2.start();

    // Wind: looped white-noise buffer through a band-pass filter.
    const len = audio.ctx.sampleRate * 2;
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    audio.windSource = audio.ctx.createBufferSource();
    audio.windSource.buffer = buffer;
    audio.windSource.loop = true;
    audio.windFilter = audio.ctx.createBiquadFilter();
    audio.windFilter.type = 'bandpass';
    audio.windFilter.frequency.value = 900;
    audio.windFilter.Q.value = 0.6;
    audio.windGain = audio.ctx.createGain();
    audio.windGain.gain.value = 0;
    audio.windSource.connect(audio.windFilter);
    audio.windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.master);
    audio.windSource.start();

    audio.unlocked = true;
    return true;
  } catch (err) {
    return false;
  }
}

/** Update engine pitch/volume and wind volume from flight state, each frame. */
export function updateEngineAudio(audio, state) {
  if (!audio.unlocked || !audio.ctx) return;
  const t = audio.ctx.currentTime;
  const throttle = state.throttle || 0;
  const rpm = 0.25 + throttle * 0.75 + (state.airspeedKmh || 0) / 900;
  const targetFreq = 42 + rpm * 68;
  const targetGain = state.engineOn ? 0.05 + throttle * 0.11 : 0;
  audio.engineOsc.frequency.setTargetAtTime(targetFreq, t, 0.08);
  audio.engineOsc2.frequency.setTargetAtTime(targetFreq / 2, t, 0.08);
  audio.engineFilter.frequency.setTargetAtTime(320 + throttle * 700, t, 0.1);
  audio.engineGain.gain.setTargetAtTime(targetGain, t, 0.1);
  // Wind grows with airspeed and with rain.
  const wind = Math.min(1, (state.airspeedKmh || 0) / 320) * 0.16 + (state.rain || 0) * 0.05;
  audio.windGain.gain.setTargetAtTime(state.onGround ? wind * 0.25 : wind, t, 0.15);
  audio.windFilter.frequency.setTargetAtTime(500 + (state.airspeedKmh || 0) * 3, t, 0.2);
}

/** Play a short tone with an envelope. `type` is an oscillator type. */
export function blip(audio, freq, duration, type, volume, when = 0) {
  if (!audio.unlocked || !audio.ctx || audio.muted) return;
  try {
    const t0 = audio.ctx.currentTime + when;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume || 0.2, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  } catch (err) { /* audio is best-effort */ }
}

/** A two-note chime when the aircraft passes a ring. */
export function ringChime(audio) {
  const now = performance.now();
  if (now - audio.lastChime < 120) return;
  audio.lastChime = now;
  blip(audio, 880, 0.35, 'sine', 0.22);
  blip(audio, 1318.5, 0.45, 'sine', 0.18, 0.09);
}

/** A low thump for a touchdown, scaled by how hard it was. */
export function touchdownThump(audio, hardness) {
  if (!audio.unlocked || !audio.ctx) return;
  try {
    const t0 = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t0);
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.18);
    gain.gain.setValueAtTime(Math.min(0.5, 0.15 + hardness * 0.2), t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  } catch (err) { /* best-effort */ }
}

/** A burst of filtered noise for a crash. */
export function crashNoise(audio) {
  if (!audio.unlocked || !audio.ctx) return;
  try {
    const t0 = audio.ctx.currentTime;
    const len = audio.ctx.sampleRate * 0.7;
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = audio.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start(t0);
    blip(audio, 55, 0.8, 'sawtooth', 0.3);
  } catch (err) { /* best-effort */ }
}

/** Stall warning: a short warbling beep. */
export function stallBeep(audio) {
  blip(audio, 620, 0.12, 'square', 0.08);
  blip(audio, 620, 0.12, 'square', 0.08, 0.16);
}

export function uiClick(audio) {
  blip(audio, 1200, 0.06, 'triangle', 0.12);
}

/** A rising three-note arpeggio for a mission complete. */
export function missionFanfare(audio) {
  blip(audio, 523.25, 0.3, 'triangle', 0.2);
  blip(audio, 659.25, 0.3, 'triangle', 0.2, 0.12);
  blip(audio, 783.99, 0.5, 'triangle', 0.22, 0.24);
  blip(audio, 1046.5, 0.7, 'triangle', 0.2, 0.36);
}

// A gentle music-box theme for the title screen: C major, slow, in the
// public-domain spirit of a folk lullaby, written for this game.
const THEME = [
  [523.25, 0.5], [659.25, 0.5], [783.99, 0.5], [1046.5, 1.0],
  [987.77, 0.5], [783.99, 0.5], [659.25, 0.5], [523.25, 1.0],
  [587.33, 0.5], [659.25, 0.5], [783.99, 0.5], [880.0, 1.0],
  [783.99, 0.5], [659.25, 0.5], [587.33, 0.5], [523.25, 1.5],
];

/** Start the title theme, looping softly until stopped. */
export function startTheme(audio) {
  if (!audio.unlocked || audio.musicOn) return;
  audio.musicOn = true;
  let index = 0;
  const stepMs = 480;
  const playNext = () => {
    if (!audio.musicOn) return;
    const [freq, beats] = THEME[index % THEME.length];
    blip(audio, freq, 0.45 * beats + 0.2, 'sine', 0.07);
    blip(audio, freq / 2, 0.45 * beats + 0.2, 'triangle', 0.03);
    index += 1;
    audio.musicTimer = window.setTimeout(playNext, stepMs * beats);
  };
  playNext();
}

export function stopTheme(audio) {
  audio.musicOn = false;
  if (audio.musicTimer) window.clearTimeout(audio.musicTimer);
  audio.musicTimer = null;
}

/** Toggle mute; returns the new muted state. */
export function toggleMute(audio) {
  audio.muted = !audio.muted;
  if (audio.master && audio.ctx) {
    audio.master.gain.setTargetAtTime(audio.muted ? 0 : 0.9, audio.ctx.currentTime, 0.05);
  }
  return audio.muted;
}
