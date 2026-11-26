// SKYHARBOUR — input: keyboard state plus mouse steering, with a clean API
// the flight model reads each frame. One file, one job: raw devices in,
// normalised pilot intent out. No game logic lives here.

import { CONTROLS } from './config.js';
import { clamp } from './utils.js';

export function createInput() {
  return {
    keys: new Set(),
    // Continuous axes, -1..1, smoothed by the caller.
    pitch: 0, // +1 = nose up (stick pulled back)
    roll: 0, // +1 = roll right
    yaw: 0, // +1 = rudder right
    throttle: 0, // 0..1, set by throttle keys, held between frames
    throttleTarget: 0,
    flaps: 0, // 0, 1 or 2 notches
    gearDown: true,
    brakes: false,
    mouseSteer: false,
    mouseX: 0,
    mouseY: 0,
    // Edge-triggered actions, consumed by main.js each frame.
    pressed: new Set(),
    // Mouse look while holding the right button.
    lookDx: 0,
    lookDy: 0,
    looking: false,
    lastLookX: 0,
    lastLookY: 0,
    // Any key at all, used to dismiss the title screen.
    anyKey: false,
    touch: false,
  };
}

function has(list, code) {
  return list.indexOf(code) !== -1;
}

/**
 * Attach keyboard and mouse listeners to the window. `onAction` is called
 * for edge-triggered keys (pause, camera, flaps, gear, reset, mute, help).
 */
export function attachInput(input, onAction) {
  const down = (event) => {
    if (event.repeat) return;
    input.keys.add(event.code);
    input.anyKey = true;
    input.pressed.add(event.code);
    if (has(CONTROLS.flaps, event.code)) onAction('flaps');
    else if (has(CONTROLS.gear, event.code)) onAction('gear');
    else if (has(CONTROLS.camera, event.code)) onAction('camera');
    else if (has(CONTROLS.pause, event.code)) onAction('pause');
    else if (has(CONTROLS.reset, event.code)) onAction('reset');
    else if (has(CONTROLS.mute, event.code)) onAction('mute');
    else if (has(CONTROLS.help, event.code)) onAction('help');
    // Keep the page from scrolling on game keys.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(event.code) !== -1) {
      event.preventDefault();
    }
  };
  const up = (event) => {
    input.keys.delete(event.code);
  };
  const blur = () => {
    input.keys.clear();
    input.brakes = false;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);

  // Mouse: moving the pointer steers when mouse-steer is on (toggled by
  // clicking the stick area or pressing M is mute, so mouse-steer is a
  // checkbox on the HUD). Right-drag looks around without steering.
  const mouseMove = (event) => {
    if (input.looking) {
      input.lookDx += event.movementX || 0;
      input.lookDy += event.movementY || 0;
    }
    if (input.mouseSteer) {
      const rect = document.body.getBoundingClientRect();
      input.mouseX = clamp(((event.clientX / rect.width) * 2 - 1), -1, 1);
      input.mouseY = clamp(((event.clientY / rect.height) * 2 - 1), -1, 1);
    }
  };
  const mouseDown = (event) => {
    if (event.button === 2) {
      input.looking = true;
      input.lastLookX = event.clientX;
      input.lastLookY = event.clientY;
    }
    if (event.button === 0) {
      // A left click on the canvas arms mouse steering; clicking a button
      // (which stops propagation) never reaches here.
      if (event.target && event.target.id === 'scene') input.mouseSteer = true;
    }
  };
  const mouseUp = (event) => {
    if (event.button === 2) input.looking = false;
    if (event.button === 0 && event.target && event.target.id === 'scene') {
      // Keep mouse steering armed until the pilot presses Esc or clicks a UI button.
    }
  };
  const contextMenu = (event) => {
    if (event.target && event.target.id === 'scene') event.preventDefault();
  };
  window.addEventListener('mousemove', mouseMove);
  window.addEventListener('mousedown', mouseDown);
  window.addEventListener('mouseup', mouseUp);
  window.addEventListener('contextmenu', contextMenu);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    window.removeEventListener('mousemove', mouseMove);
    window.removeEventListener('mousedown', mouseDown);
    window.removeEventListener('mouseup', mouseUp);
    window.removeEventListener('contextmenu', contextMenu);
  };
}

/** Read the held keys into continuous axes. Call once per frame. */
export function pollInput(input, dt) {
  const k = input.keys;
  let pitch = 0;
  let roll = 0;
  let yaw = 0;
  for (const code of k) {
    if (has(CONTROLS.pitchUp, code)) pitch += 1;
    if (has(CONTROLS.pitchDown, code)) pitch -= 1;
    if (has(CONTROLS.rollLeft, code)) roll -= 1;
    if (has(CONTROLS.rollRight, code)) roll += 1;
    if (has(CONTROLS.rudderLeft, code)) yaw -= 1;
    if (has(CONTROLS.rudderRight, code)) yaw += 1;
  }
  // Mouse steering blends in: pointer left/right rolls, up/down pitches.
  if (input.mouseSteer) {
    roll += input.mouseX * 0.9;
    pitch -= input.mouseY * 0.9;
  }
  // Smooth the axes so the stick never snaps.
  const rate = 7;
  const blend = 1 - Math.exp(-rate * dt);
  input.pitch += (clamp(pitch, -1, 1) - input.pitch) * blend;
  input.roll += (clamp(roll, -1, 1) - input.roll) * blend;
  input.yaw += (clamp(yaw, -1, 1) - input.yaw) * blend;

  // Throttle: Shift/W raises, Ctrl/S lowers, held keys move it steadily.
  let throttleMove = 0;
  for (const code of k) {
    if (has(CONTROLS.throttleUp, code)) throttleMove += 1;
    if (has(CONTROLS.throttleDown, code)) throttleMove -= 1;
  }
  input.throttle = clamp(input.throttle + throttleMove * dt * 0.55, 0, 1);
  input.brakes = false;
  for (const code of k) {
    if (has(CONTROLS.brakes, code)) input.brakes = true;
  }
  // Consume edge presses.
  input.pressed.clear();
  return input;
}
