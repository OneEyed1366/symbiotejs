// Drivers read requestAnimationFrame / cancelAnimationFrame from the host at
// call time rather than importing them: React Native installs them on the
// global, but a Node headless run may not have them until a smoke polyfills
// them. Resolving lazily means a polyfill installed after this module loads is
// still seen. A driver that runs without a host scheduler is a bug, not a
// silent no-op, so we throw.

type IRequestFrame = (callback: () => void) => number;
type ICancelFrame = (handle: number) => void;

function readGlobal(name: string): unknown {
  return Reflect.get(globalThis, name);
}

export function requestFrame(callback: () => void): number {
  const raf = readGlobal('requestAnimationFrame');
  if (typeof raf !== 'function') {
    throw new Error('requestAnimationFrame is not available on the host');
  }
  const run: IRequestFrame = cb => Number(Reflect.apply(raf, globalThis, [cb]));
  return run(callback);
}

export function cancelFrame(handle: number): void {
  const caf = readGlobal('cancelAnimationFrame');
  if (typeof caf !== 'function') return;
  const run: ICancelFrame = h => {
    Reflect.apply(caf, globalThis, [h]);
  };
  run(handle);
}

// A `delay` config defers an animation's launch. setTimeout / clearTimeout are
// read from the host the same way as the frame scheduler, so the shared tsconfig
// needs no DOM / Node lib and a host without timers fails loudly rather than
// silently never firing. The opaque handle is whatever the host returns.
export type ITimerHandle = unknown;

export function setTimer(callback: () => void, delayMs: number): ITimerHandle {
  const set = readGlobal('setTimeout');
  if (typeof set !== 'function') {
    throw new Error('setTimeout is not available on the host');
  }
  return Reflect.apply(set, globalThis, [callback, delayMs]);
}

export function clearTimer(handle: ITimerHandle): void {
  const clear = readGlobal('clearTimeout');
  if (typeof clear !== 'function') return;
  Reflect.apply(clear, globalThis, [handle]);
}
