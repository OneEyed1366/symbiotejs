import { describe, it, expect } from 'vitest';
import {
  reduceSticky,
  createInitialStickyState,
  stickyEffectSignature,
  type IStickyReducerInputs,
} from './sticky-header-reducer';

// The reducer holds NO timer: the debounce is a `schedule-debounce` EFFECT the adapter executes with
// its own setTimeout, so the reducer only ever emits the delay as data — there is no real (or fake)
// time to inject here. Every assertion is over the pure transition + emitted effects.

const IOS_DEBOUNCE_MS = 64;
const ANDROID_DEBOUNCE_MS = 15;

function topInputs(over: Partial<IStickyReducerInputs> = {}): IStickyReducerInputs {
  return {
    os: 'ios',
    inverted: undefined,
    scrollViewHeight: undefined,
    nextHeaderLayoutY: undefined,
    ...over,
  };
}

describe('createInitialStickyState', () => {
  it('starts un-measured with the identity interpolation and the swallow gate armed', () => {
    const state = createInitialStickyState();
    expect(state.measured).toBe(false);
    expect(state.translateY).toBeNull();
    expect(state.haveReceivedInitialZeroTranslateY).toBe(true);
    expect(state.inputRange).toEqual([-1, 0]);
    expect(state.outputRange).toEqual([0, 0]);
  });
});

describe('reduceSticky layout — rebuild-interpolation ranges', () => {
  it('the top branch pins at layoutY and tracks 1:1 past it', () => {
    const state = createInitialStickyState();
    const result = reduceSticky(state, { kind: 'layout', y: 100, height: 40 }, topInputs());
    expect(result.changed).toBe(true);
    expect(result.state.measured).toBe(true);
    expect(result.state.layoutY).toBe(100);
    const rebuild = result.effects.find(effect => effect.kind === 'rebuild-interpolation');
    if (rebuild?.kind !== 'rebuild-interpolation')
      throw new Error('expected rebuild-interpolation');
    // No next header: identity [-1,0] then the top pin at layoutY, tracking 1:1 past it.
    expect(rebuild.inputRange).toEqual([-1, 0, 100, 101]);
    expect(rebuild.outputRange).toEqual([0, 0, 0, 1]);
  });

  it('the inverted branch pins at the viewport bottom (a different range than top)', () => {
    const state = createInitialStickyState();
    const inputs = topInputs({ inverted: true, scrollViewHeight: 200 });
    const result = reduceSticky(state, { kind: 'layout', y: 300, height: 40 }, inputs);
    const rebuild = result.effects.find(effect => effect.kind === 'rebuild-interpolation');
    if (rebuild?.kind !== 'rebuild-interpolation')
      throw new Error('expected rebuild-interpolation');
    // stickStartPoint = 300 + 40 - 200 = 140 > 0, so it sticks from there.
    expect(rebuild.inputRange).toEqual([-1, 0, 140, 141]);
    expect(rebuild.outputRange).toEqual([0, 0, 0, 1]);
    // Same layout, top branch, resolves to a DIFFERENT range — proving inverted is honored.
    const top = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 300, height: 40 },
      topInputs(),
    );
    const topRebuild = top.effects.find(effect => effect.kind === 'rebuild-interpolation');
    if (topRebuild?.kind !== 'rebuild-interpolation')
      throw new Error('expected rebuild-interpolation');
    expect(topRebuild.inputRange).not.toEqual(rebuild.inputRange);
  });

  it('rebuilds on an inputs-changed recompute but NOT on an animated tick or debounce fire', () => {
    const measured = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 100, height: 40 },
      topInputs(),
    ).state;

    const changed = reduceSticky(
      measured,
      { kind: 'inputs-changed' },
      topInputs({ nextHeaderLayoutY: 300 }),
    );
    expect(changed.effects.some(effect => effect.kind === 'rebuild-interpolation')).toBe(true);
    // The next header at 300 sets the collision point (300 - 40 = 260), so the range now tracks to it.
    expect(changed.state.inputRange).toEqual([-1, 0, 100, 260, 261]);

    const tick = reduceSticky(changed.state, { kind: 'animated-tick', value: 5 }, topInputs());
    expect(tick.effects.some(effect => effect.kind === 'rebuild-interpolation')).toBe(false);
    const settle = reduceSticky(tick.state, { kind: 'debounce-fired', value: 5 }, topInputs());
    expect(settle.effects.some(effect => effect.kind === 'rebuild-interpolation')).toBe(false);
  });
});

describe('reduceSticky debounce scheduling', () => {
  it('an animated tick schedules a host-tuned debounce carrying the value', () => {
    const state = createInitialStickyState();
    const ios = reduceSticky(state, { kind: 'animated-tick', value: 12 }, topInputs({ os: 'ios' }));
    expect(ios.changed).toBe(false);
    expect(ios.effects).toEqual([{ kind: 'schedule-debounce', delay: IOS_DEBOUNCE_MS, value: 12 }]);

    const android = reduceSticky(
      state,
      { kind: 'animated-tick', value: 12 },
      topInputs({ os: 'android' }),
    );
    expect(android.effects).toEqual([
      { kind: 'schedule-debounce', delay: ANDROID_DEBOUNCE_MS, value: 12 },
    ]);
  });

  it('debounce-fired commits the translateY and asks for a passthrough', () => {
    const state = createInitialStickyState();
    const result = reduceSticky(state, { kind: 'debounce-fired', value: 7 }, topInputs());
    expect(result.changed).toBe(true);
    expect(result.state.translateY).toBe(7);
    expect(result.effects).toEqual([{ kind: 'apply-passthrough', translateY: 7 }]);
  });
});

describe('reduceSticky zero-swallow gate', () => {
  it('lets the first zero through (gate armed), but swallows a zero re-emitted after a real value', () => {
    let state = createInitialStickyState();

    // Gate armed on init: the very first zero is a genuine settle, not a rebuild artifact — scheduled.
    const firstZero = reduceSticky(state, { kind: 'animated-tick', value: 0 }, topInputs());
    expect(firstZero.effects).toEqual([
      { kind: 'schedule-debounce', delay: IOS_DEBOUNCE_MS, value: 0 },
    ]);
    state = firstZero.state;

    // A real non-zero value commits, which re-arms the gate (flag -> false).
    state = reduceSticky(state, { kind: 'animated-tick', value: 9 }, topInputs()).state;
    state = reduceSticky(state, { kind: 'debounce-fired', value: 9 }, topInputs()).state;
    expect(state.haveReceivedInitialZeroTranslateY).toBe(false);

    // Now a rebuild re-emits 0: SWALLOWED (no effect), and swallowing re-arms the gate.
    const swallowed = reduceSticky(state, { kind: 'animated-tick', value: 0 }, topInputs());
    expect(swallowed.changed).toBe(false);
    expect(swallowed.effects).toEqual([]);
    expect(swallowed.state.haveReceivedInitialZeroTranslateY).toBe(true);

    // The next zero is a genuine settle again — no longer swallowed.
    const throughAgain = reduceSticky(
      swallowed.state,
      { kind: 'animated-tick', value: 0 },
      topInputs(),
    );
    expect(throughAgain.effects).toEqual([
      { kind: 'schedule-debounce', delay: IOS_DEBOUNCE_MS, value: 0 },
    ]);
  });

  it('a zero-valued debounce fire does NOT re-arm the gate', () => {
    const state = reduceSticky(
      createInitialStickyState(),
      { kind: 'debounce-fired', value: 0 },
      topInputs(),
    ).state;
    expect(state.haveReceivedInitialZeroTranslateY).toBe(true);
  });
});

describe('reduceSticky cross-talk record-header-y', () => {
  it('emits record-header-y on layout ONLY when the reducer owns the child index', () => {
    const withIndex = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 120, height: 40 },
      topInputs({ index: 2 }),
    );
    expect(withIndex.effects).toContainEqual({ kind: 'record-header-y', index: 2, y: 120 });

    const withoutIndex = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 120, height: 40 },
      topInputs(),
    );
    expect(withoutIndex.effects.some(effect => effect.kind === 'record-header-y')).toBe(false);
  });
});

describe('stickyEffectSignature', () => {
  it('changes when the committed translateY moves and stays put otherwise', () => {
    const state = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 100, height: 40 },
      topInputs(),
    ).state;
    const before = stickyEffectSignature(state);
    const settled = reduceSticky(state, { kind: 'debounce-fired', value: 5 }, topInputs()).state;
    expect(stickyEffectSignature(settled)).not.toBe(before);
    const idle = reduceSticky(settled, { kind: 'animated-tick', value: 5 }, topInputs()).state;
    expect(stickyEffectSignature(idle)).toBe(stickyEffectSignature(settled));
  });
});
