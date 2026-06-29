// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `long-press.smoke`. Proves the long-press SYNTHESIS in the engine's events layer:
// there is no native longPress event. The engine arms a hold timer on topTouchStart
// when a node in the press path listens for it, fires a bubbling `longPress` after the
// delay, and suppresses the tap on release. The 500ms delay is RN's Touchable default;
// the smoke waited real wall-clock, here vitest fake timers advance it deterministically.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, Text } from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';

const ROOT_TAG = 140;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';
// Longer than the 500ms synthesis delay so the hold timer has surely fired.
const HOLD_ADVANCE_MS = 600;

const fabric = installFabric();
beforeEach(() => {
  vi.useFakeTimers();
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

function handleFor(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

describe('React long-press synthesis', () => {
  it('fires longPress once after the hold delay and suppresses the tap', () => {
    let longPress = 0;
    let press = 0;
    mount(
      ROOT_TAG,
      <Text
        testID="hold"
        onLongPress={() => {
          longPress++;
        }}
        onPress={() => {
          press++;
        }}
      >
        hold me
      </Text>,
    );
    const h = handleFor('hold');
    fabric.fireEvent(h, TOUCH_START);
    vi.advanceTimersByTime(HOLD_ADVANCE_MS);
    expect(longPress).toBe(1);
    expect(press).toBe(0);
    fabric.fireEvent(h, TOUCH_END);
    expect(longPress).toBe(1);
    expect(press).toBe(0);
  });

  it('fires press (never longPress) on a quick tap and disarms the timer on release', () => {
    let longPress = 0;
    let press = 0;
    mount(
      ROOT_TAG,
      <Text
        testID="tap"
        onLongPress={() => {
          longPress++;
        }}
        onPress={() => {
          press++;
        }}
      >
        tap me
      </Text>,
    );
    const h = handleFor('tap');
    fabric.fireEvent(h, TOUCH_START);
    fabric.fireEvent(h, TOUCH_END);
    expect(press).toBe(1);
    expect(longPress).toBe(0);
    // The timer was armed at start; advancing must surface no stray fire.
    vi.advanceTimersByTime(HOLD_ADVANCE_MS);
    expect(longPress).toBe(0);
  });

  it('cancels the pending longPress when a move drifts past the deactivation distance', () => {
    let longPress = 0;
    mount(
      ROOT_TAG,
      <Text
        testID="drift"
        onLongPress={() => {
          longPress++;
        }}
      >
        drift me
      </Text>,
    );
    const h = handleFor('drift');
    fabric.fireEvent(h, TOUCH_START, { pageX: 0, pageY: 0 });
    fabric.fireEvent(h, TOUCH_MOVE, { pageX: 20, pageY: 0 });
    vi.advanceTimersByTime(HOLD_ADVANCE_MS);
    expect(longPress).toBe(0);
    fabric.fireEvent(h, TOUCH_END);
  });

  it('keeps the timer armed when a small move stays within the deactivation distance', () => {
    let longPress = 0;
    mount(
      ROOT_TAG,
      <Text
        testID="nudge"
        onLongPress={() => {
          longPress++;
        }}
      >
        nudge me
      </Text>,
    );
    const h = handleFor('nudge');
    fabric.fireEvent(h, TOUCH_START, { pageX: 0, pageY: 0 });
    fabric.fireEvent(h, TOUCH_MOVE, { pageX: 5, pageY: 5 });
    vi.advanceTimersByTime(HOLD_ADVANCE_MS);
    expect(longPress).toBe(1);
    fabric.fireEvent(h, TOUCH_END);
  });
});
