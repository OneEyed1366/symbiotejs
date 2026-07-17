// Co-located unit test for the shared TouchableOpacity press-feedback machine. The three adapters
// (React/Vue/Angular) used to re-implement this scheduling line-for-line; it now lives here once and
// each adapter supplies only its native activate/deactivate (the Animated opacity fade + the
// framework emit). This drives the machine with a dependency-injected fake clock + scheduler — no
// real time — proving: the delayPressIn defer timer, the early-release flush, the min-press-duration
// hold, and the activate/deactivate ordering.

import { describe, expect, it } from 'vitest';
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  createTouchableFeedbackHandlers,
  createTouchableFeedbackRuntime,
  DEFAULT_MIN_PRESS_DURATION_MS,
  type ITouchableFeedbackConfig,
} from './touchable';

// A deterministic clock + one-shot scheduler: time only moves when the test calls advance(); a
// scheduled callback fires once when the clock reaches its due time, and its returned canceller
// removes it (the flush-on-early-release path). No real setTimeout, so the hold is exact.
interface IScheduled {
  due: number;
  callback: () => void;
  cancelled: boolean;
}

function makeClock(): {
  schedule: ITouchableFeedbackConfig['schedule'];
  now: () => number;
  advance: (ms: number) => void;
  pending: () => number;
} {
  let clock = 0;
  const scheduled: IScheduled[] = [];

  return {
    schedule(callback: () => void, ms: number): () => void {
      const entry: IScheduled = { due: clock + ms, callback, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    now: () => clock,
    advance(ms: number): void {
      const target = clock + ms;
      for (;;) {
        const due = scheduled
          .filter(entry => !entry.cancelled && entry.due <= target)
          .sort((a, b) => a.due - b.due)[0];
        if (due === undefined) break;
        clock = due.due;
        due.cancelled = true;
        due.callback();
      }
      clock = target;
    },
    pending(): number {
      return scheduled.filter(entry => !entry.cancelled).length;
    },
  };
}

function makeEvent(): ISymbioteEvent {
  const target = createElement('RCTView');
  return {
    type: 'topTouchStart',
    target,
    currentTarget: target,
    nativeEvent: {},
    stopPropagation: () => {},
  };
}

// A recorder for the injected native seam. `log` is the ordered activate/deactivate trace.
function makeCallbacks(): {
  activate: (e: ISymbioteEvent) => void;
  deactivate: (e: ISymbioteEvent) => void;
  log: string[];
} {
  const log: string[] = [];
  return {
    activate: () => log.push('activate'),
    deactivate: () => log.push('deactivate'),
    log,
  };
}

function baseConfig(
  clock: ReturnType<typeof makeClock>,
  over: Partial<ITouchableFeedbackConfig> = {},
): ITouchableFeedbackConfig {
  return {
    delayPressIn: 0,
    delayPressOut: 0,
    minPressDuration: 0,
    schedule: clock.schedule,
    now: clock.now,
    ...over,
  };
}

describe('createTouchableFeedbackHandlers', () => {
  it('activates synchronously on pressIn when no delay, deactivates on pressOut', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
      baseConfig(clock),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    expect(cb.log).toEqual(['activate']);
    expect(clock.pending()).toBe(0);

    handlePressOut(makeEvent());
    expect(cb.log).toEqual(['activate', 'deactivate']);
  });

  it('defers activation behind delayPressIn until the timer fires', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn } = createTouchableFeedbackHandlers(
      baseConfig(clock, { delayPressIn: 30 }),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    // The active visual is deferred: nothing yet, one pending timer.
    expect(cb.log).toEqual([]);
    expect(clock.pending()).toBe(1);

    clock.advance(30);
    expect(cb.log).toEqual(['activate']);
  });

  it('flushes a still-pending delayPressIn timer on an early release, then holds min-press-duration', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
      baseConfig(clock, { delayPressIn: 30, minPressDuration: DEFAULT_MIN_PRESS_DURATION_MS }),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    expect(cb.log).toEqual([]);

    // Release before the 30ms defer elapses: it flushes (synchronous activate), then the deactivate
    // is held minPressDuration past that activation so a fast tap still flashes the visual.
    handlePressOut(makeEvent());
    expect(cb.log).toEqual(['activate']);
    // The original defer timer was cancelled; only the deactivate hold is pending.
    expect(clock.pending()).toBe(1);

    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(cb.log).toEqual(['activate', 'deactivate']);
  });

  it('holds the deactivate for minPressDuration minus the time already held', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
      baseConfig(clock, { minPressDuration: 130 }),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    expect(cb.log).toEqual(['activate']);

    // Held 50ms already, so the remaining hold is 130 - 50 = 80ms.
    clock.advance(50);
    handlePressOut(makeEvent());
    expect(cb.log).toEqual(['activate']);

    clock.advance(79);
    expect(cb.log).toEqual(['activate']);
    clock.advance(1);
    expect(cb.log).toEqual(['activate', 'deactivate']);
  });

  it('waits at least delayPressOut when it exceeds the remaining min-press-duration hold', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
      baseConfig(clock, { minPressDuration: 0, delayPressOut: 40 }),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    handlePressOut(makeEvent());
    // minPressDuration is 0 but delayPressOut floors the wait at 40ms.
    expect(cb.log).toEqual(['activate']);
    clock.advance(39);
    expect(cb.log).toEqual(['activate']);
    clock.advance(1);
    expect(cb.log).toEqual(['activate', 'deactivate']);
  });

  it('deactivates synchronously when neither hold applies', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
      baseConfig(clock, { minPressDuration: 0, delayPressOut: 0 }),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    handlePressOut(makeEvent());
    expect(cb.log).toEqual(['activate', 'deactivate']);
    expect(clock.pending()).toBe(0);
  });
});
