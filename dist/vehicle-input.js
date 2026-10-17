




export const STEERING_MAX_ANGLE = 135;
export const shortestAngleDegrees = delta =>
  Math.atan2(Math.sin(delta), Math.cos(delta)) * 180 / Math.PI;
export function fingerAngleAt(event, bounds, clientWidth) {
  const x = event.clientX - (bounds.left + bounds.width / 2);
  const y = event.clientY - (bounds.top + bounds.height / 2);
  const deadRadius = Math.min(20, clientWidth * .16);
  return !Number.isFinite(x) || !Number.isFinite(y) || x * x + y * y < deadRadius * deadRadius
    ? undefined : Math.atan2(y, x);
}
const GAS_KEYS = new Set(['KeyW', 'ArrowUp', 'Space']);
const STEERING_KEYS = new Set(['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight']);
const BRAKE_KEYS=new Set(['KeyS','ArrowDown']);
const HANDBRAKE_KEYS=new Set(['ShiftLeft','ShiftRight']);
const MOVEMENT_KEYS = new Set([...GAS_KEYS, ...STEERING_KEYS,...BRAKE_KEYS,...HANDBRAKE_KEYS]);
const clampSteering = value => Math.max(-1, Math.min(1, value));

export function createVehicleInput({
  root,
  onInput = () => {},
  onStart = () => {},
  onGear = () => {},
  onSafetyReset = () => {},
} = {}) {
  const wheel = root?.querySelector('.steering-wheel');
  const image = wheel?.querySelector('.steering-wheel-image');
  const pedal = root?.querySelector('.gas-pedal');
  const reverse = root?.querySelector('.reverse-pedal');
  const brakePedal=root?.querySelector('.brake-pedal'),handbrakePedal=root?.querySelector('.handbrake-pedal');
  const controls = [wheel, pedal, reverse].filter(Boolean);
  if (!root?.ownerDocument?.defaultView || !wheel || !image || !pedal)
    throw new Error('Driving controls need root, wheel, wheel image and gas pedal elements.');
  const doc = root.ownerDocument, win = doc.defaultView;
  const keys = new Set(), removers = [];
  let steering = 0, wheelPointer, pedalPointer, reversePointer, anchor;
  let enabled = true, destroyed = false, wasActive = false;
  let driftEnabled=false,brakePointer,handbrakePointer;
  const listen = (element, type, fn, options) => {
    element.addEventListener(type, fn, options);
    removers.push(() => element.removeEventListener(type, fn, options));
  };
  const active = () => enabled && !destroyed
    && (reversePointer !== undefined || pedalPointer !== undefined || [...GAS_KEYS].some(key => keys.has(key)));
  const isEditable = target => !!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || !!target?.isContentEditable;
  const keyCode = event => {
    if (MOVEMENT_KEYS.has(event.code)) return event.code;
    if (MOVEMENT_KEYS.has(event.key)) return event.key;
    if (event.key === ' ' || event.key === 'Spacebar') return 'Space';
    const letter = event.key?.toUpperCase();
    return ['W', 'A', 'D'].includes(letter) ? `Key${letter}` : undefined;
  };
  const keyboardSteering = () => Number(keys.has('KeyD') || keys.has('ArrowRight'))
    - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  function emit() {
    const held = active(), started = held && !wasActive;
    wasActive = held;
    wheel.style.setProperty('--steering-angle', `${steering * STEERING_MAX_ANGLE}deg`);
    wheel.classList.toggle('is-active', wheelPointer !== undefined);
    wheel.setAttribute('aria-valuenow', steering.toFixed(2));
    wheel.setAttribute('aria-valuetext', steering === 0 ? 'Прямо'
      : `${steering > 0 ? 'Вправо' : 'Влево'} ${Math.round(Math.abs(steering) * 100)}%`);
    const reversing = held && reversePointer !== undefined;
    pedal.classList.toggle('is-active', held && !reversing);
    pedal.setAttribute('aria-pressed', String(held && !reversing));
    reverse?.classList.toggle('is-active', reversing);
    reverse?.setAttribute('aria-pressed', String(reversing));


    if (held && reverse) onGear(reversing ? 'R' : 'D');
    root.dataset.throttle = String(held);

    const brake=driftEnabled&&(brakePointer!==undefined||[...BRAKE_KEYS].some(k=>keys.has(k)))?1:0;
    const handbrake=driftEnabled&&(handbrakePointer!==undefined||[...HANDBRAKE_KEYS].some(k=>keys.has(k)))?1:0;
    for(const [element,value]of [[brakePedal,brake],[handbrakePedal,handbrake]]){element?.classList.toggle('is-active',!!value);element?.setAttribute('aria-pressed',String(!!value));}
    onInput(driftEnabled?{ steering, active: held,brake,handbrake }:{ steering, active: held });
    if (started) onStart();
  }
  function visualRotation(element) {
    const transform = win.getComputedStyle(element).transform;
    if (!transform || transform === 'none') return 0;
    if (win.DOMMatrixReadOnly) {
      try {
        const matrix = new win.DOMMatrixReadOnly(transform);
        const rotation = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
        if (Number.isFinite(rotation)) return rotation;
      } catch {                                                                 }
    }
    const rotate = transform.match(/^rotate\(([-.\d]+)deg\)$/);
    if (rotate) return Number(rotate[1]);
    const matrix = transform.match(/^matrix\(([^)]+)\)$/);
    if (matrix) {
      const values = matrix[1].split(',').map(Number);
      const rotation = Math.atan2(values[1], values[0]) * 180 / Math.PI;
      if (Number.isFinite(rotation)) return rotation;
    }
    return element === wheel ? steering * STEERING_MAX_ANGLE : 0;
  }
  const angle = event => fingerAngleAt(event, wheel.getBoundingClientRect(), wheel.clientWidth);
  function releaseCapture(element, pointer) {
    if (pointer !== undefined && element.hasPointerCapture?.(pointer)) {
      try { element.releasePointerCapture(pointer); } catch {                                             }
    }
  }
  function reset() {
    if (destroyed) return;
    const previousWheel = wheelPointer, previousPedal = pedalPointer, previousReverse = reversePointer;
    wheelPointer = pedalPointer = reversePointer = anchor = undefined;
    if(brakePointer!==undefined)releaseCapture(brakePedal,brakePointer);
    if(handbrakePointer!==undefined)releaseCapture(handbrakePedal,handbrakePointer);
    brakePointer=handbrakePointer=undefined;
    keys.clear();
    steering = 0;

    releaseCapture(wheel, previousWheel);
    releaseCapture(pedal, previousPedal);
    if (reverse) releaseCapture(reverse, previousReverse);
    wheel.classList.add('is-returning');
    emit();
  }
  listen(wheel, 'pointerdown', event => {
    if (!enabled || destroyed || wheelPointer !== undefined || event.button !== 0 || event.pointerId === pedalPointer || event.pointerId === reversePointer) return;
    event.preventDefault();
    event.stopPropagation();
    for (const key of STEERING_KEYS) keys.delete(key);
    wheelPointer = event.pointerId;
    steering = clampSteering((visualRotation(wheel) + visualRotation(image)) / STEERING_MAX_ANGLE);
    anchor = angle(event);
    wheel.classList.remove('is-returning');
    try { wheel.setPointerCapture?.(wheelPointer); } catch {                                                }
    emit();
  });
  listen(pedal, 'pointerdown', event => {
    if (!enabled || destroyed || pedalPointer !== undefined || event.button !== 0 || event.pointerId === wheelPointer || event.pointerId === reversePointer) return;
    event.preventDefault();
    event.stopPropagation();

    for (const key of GAS_KEYS) keys.delete(key);
    pedalPointer = event.pointerId;
    try { pedal.setPointerCapture?.(pedalPointer); } catch {                                                }
    emit();
  });
  if (reverse) listen(reverse, 'pointerdown', event => {
    if (!enabled || destroyed || reversePointer !== undefined || event.button !== 0
      || event.pointerId === wheelPointer || event.pointerId === pedalPointer) return;
    event.preventDefault();
    event.stopPropagation();
    for (const key of GAS_KEYS) keys.delete(key);
    reversePointer = event.pointerId;
    try { reverse.setPointerCapture?.(reversePointer); } catch {                                }
    emit();
  });
  function pointerMove(event) {
    if (event.pointerId !== wheelPointer && event.pointerId !== pedalPointer && event.pointerId !== reversePointer) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.pointerId !== wheelPointer) return;
    const next = angle(event);
    if (next === undefined) { anchor = undefined; return; }
    if (anchor !== undefined)
      steering = clampSteering(steering + shortestAngleDegrees(next - anchor) / STEERING_MAX_ANGLE);
    anchor = next;
    emit();
  }
  function release(event) {
    if (event.pointerId !== wheelPointer && event.pointerId !== pedalPointer && event.pointerId !== reversePointer) return;
    event.stopPropagation();
    if (event.pointerId === wheelPointer) {
      const previous = wheelPointer;
      wheelPointer = anchor = undefined;
      steering = keyboardSteering();
      releaseCapture(wheel, previous);
      wheel.classList.add('is-returning');
    } else if (event.pointerId === reversePointer) {
      const previous = reversePointer;
      reversePointer = undefined;
      releaseCapture(reverse, previous);
    } else {
      const previous = pedalPointer;
      pedalPointer = undefined;
      releaseCapture(pedal, previous);
    }
    emit();
  }
  for (const element of controls) listen(element, 'pointermove', pointerMove);

  listen(win, 'pointermove', pointerMove, { capture: true, passive: false });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    for (const element of controls) listen(element, type, release);
    listen(win, type, release, true);
  }
  listen(win, 'keydown', event => {
    const code = keyCode(event);
    if(!driftEnabled&&(BRAKE_KEYS.has(code)||HANDBRAKE_KEYS.has(code)))return;
    if (!enabled || destroyed || !code || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();

    if (event.repeat || (GAS_KEYS.has(code) ? (pedalPointer !== undefined || reversePointer !== undefined) : STEERING_KEYS.has(code)&&wheelPointer !== undefined)) return;
    keys.add(code);
    if (wheelPointer === undefined) {
      steering = keyboardSteering();
      wheel.classList.toggle('is-returning', steering === 0);
    }
    emit();
  }, true);
  for(const [element,kind]of [[brakePedal,'brake'],[handbrakePedal,'handbrake']])if(element){
    listen(element,'pointerdown',event=>{
      if(!enabled||!driftEnabled||destroyed||event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      if(kind==='brake')brakePointer=event.pointerId;else handbrakePointer=event.pointerId;
      element.setPointerCapture?.(event.pointerId);emit();
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(win,type,event=>{
      if(kind==='brake'&&event.pointerId===brakePointer){brakePointer=undefined;releaseCapture(element,event.pointerId);emit();}
      if(kind==='handbrake'&&event.pointerId===handbrakePointer){handbrakePointer=undefined;releaseCapture(element,event.pointerId);emit();}
    },true);
  }
  listen(win, 'keyup', event => {
    const code = keyCode(event);
    if (!keys.has(code)) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    keys.delete(code);
    if (wheelPointer === undefined) {
      steering = keyboardSteering();
      wheel.classList.toggle('is-returning', steering === 0);
    }
    emit();
  }, true);
  for (const type of ['dblclick', 'contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange', 'gestureend']) {
    listen(root, type, event => { if (event.cancelable) event.preventDefault(); }, { capture: true, passive: false });
  }
  const safetyReset = () => { reset(); onSafetyReset(); };
  for (const type of ['blur', 'pagehide', 'resize']) listen(win, type, safetyReset);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) safetyReset(); });
  listen(doc, 'focusin', event => { if (isEditable(event.target)) safetyReset(); });
  for (const element of controls) element.setAttribute('aria-disabled', 'false');
  emit();
  return {
    get state() { return { steering, active: active(), pointerId: wheelPointer, wheelPointerId: wheelPointer, pedalPointerId: pedalPointer, reversePointerId: reversePointer, enabled }; },
    reset,
    setDriftEnabled(value){const next=!!value;if(next===driftEnabled)return;reset();driftEnabled=next;root.classList.toggle('has-drift-controls',next);if(brakePedal)brakePedal.hidden=!next;if(handbrakePedal)handbrakePedal.hidden=!next;emit();},

    setGear() {},
    setEnabled(value) {
      const previous = enabled;
      enabled = Boolean(value) && !destroyed;
      root.hidden = !enabled;
      for (const element of controls) element.setAttribute('aria-disabled', String(!enabled));
      if (!enabled) reset();
      else if (!previous) emit();
    },
    destroy() {
      if (destroyed) return;
      enabled = false;
      reset();
      destroyed = true;
      for (const element of controls) element.setAttribute('aria-disabled', 'true');
      for (const remove of removers) remove();
    },
  };
}
