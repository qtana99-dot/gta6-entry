// Keyboard and mouse state, with per-step edge flags. The simulation reads held keys and
// single-press events; main clears the edges after each fixed step so nothing repeats.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyQ', 'KeyR', 'KeyF', 'KeyH',
  'Escape', 'Enter', 'Digit1', 'Digit2',
]);

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = {
    x: 0, y: 0,
    down: false,
    pressed: false,
    released: false,
    wheel: 0,
    inside: false,
  };

  const onKeyDown = (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
  };
  const onKeyUp = (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    held.delete(e.code);
  };
  const onBlur = () => {
    held.clear();
    pressed.clear();
    mouse.down = false;
  };
  const updateMouse = (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.inside = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= rect.width && mouse.y <= rect.height;
  };
  const onPointerMove = (e) => updateMouse(e);
  const onPointerDown = (e) => {
    updateMouse(e);
    if (e.button === 0) {
      mouse.down = true;
      mouse.pressed = true;
    }
  };
  const onPointerUp = (e) => {
    updateMouse(e);
    if (e.button === 0) {
      mouse.down = false;
      mouse.released = true;
    }
  };
  const onWheel = (e) => {
    mouse.wheel += Math.sign(e.deltaY);
    e.preventDefault();
  };
  const onContextMenu = (e) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  function isDown(code) {
    return held.has(code);
  }

  function anyDown(...codes) {
    return codes.some((c) => held.has(c));
  }

  function wasPressed(code) {
    return pressed.has(code);
  }

  function anyPressed(...codes) {
    return codes.some((c) => pressed.has(c));
  }

  function axis(neg, pos) {
    return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);
  }

  function clearStep() {
    pressed.clear();
    mouse.pressed = false;
    mouse.released = false;
    mouse.wheel = 0;
  }

  return {
    isDown,
    anyDown,
    wasPressed,
    anyPressed,
    axis,
    clearStep,
    mouse,
    get moveX() { return axis('KeyA', 'KeyD') || axis('ArrowLeft', 'ArrowRight'); },
    get moveY() { return axis('KeyW', 'KeyS') || axis('ArrowUp', 'ArrowDown'); },
    get sprint() { return anyDown('ShiftLeft', 'ShiftRight'); },
    get handbrake() { return anyDown('Space'); },
  };
}
