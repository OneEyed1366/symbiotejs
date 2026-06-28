// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `pressable.smoke`. Drives the real touch primitives the way native would
// (topTouchStart/Move/End on the responder node's instanceHandle) and asserts the
// synthesized press, disabled suppression, the JS-synthesized onLongPress timer,
// pressRetentionOffset (radius and measured per-edge rect), unstable_pressDelay,
// onResponderTerminationRequest gating, onPressMove, plus Button's a11y mapping.
//
// Pressable measures its responder rect on grant (RN's _measureResponderRegion); the
// shared recorder has no `measure`, so graft a configurable one onto the live slot before
// any mount. Long-press / pressDelay timers run on vitest fake timers.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, Pressable, Button } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 110;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';
const TOUCH_IDENTIFIER = 1;
const TERMINATION_REQUEST = 'responderTerminationRequest';

// The frame slot.measure reports; undefined disables measure (the radius fallback path).
let measuredFrame: { width: number; height: number; pageX: number; pageY: number } | undefined;

const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.measure = (_node, callback) => {
  const frame = measuredFrame;
  if (frame === undefined) return;
  callback(0, 0, frame.width, frame.height, frame.pageX, frame.pageY);
};

beforeEach(() => {
  vi.useFakeTimers();
  fabric.reset();
  measuredFrame = undefined;
});
afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// The responder is the Pressable's own RCTView, the first non-box-none RCTView created.
function responderHandle(): unknown {
  const view = fabric.find(n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none');
  if (!view) throw new Error('no RCTView (Pressable responder) was created');
  return view.instanceHandle;
}

// The latest committed props of the responder View (re-read after each commit).
function responderProps(): Record<string, unknown> {
  function find(node: IFakeNode): IFakeNode | undefined {
    if (node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none') return node;
    for (const child of node.children) {
      const hit = find(child);
      if (hit) return hit;
    }
    return undefined;
  }
  for (const root of fabric.committed) {
    const hit = find(root);
    if (hit) return hit.props;
  }
  throw new Error('no committed RCTView found');
}

function fire(handle: unknown, type: string): void {
  fabric.fireEvent(handle, type);
}

// A single-touch native event at a page coordinate; topTouchEnd reports the lifted finger
// only in changedTouches (touches is now empty), start/move keep it in both.
function fireAt(handle: unknown, type: string, x: number, y: number): void {
  const touch = { pageX: x, pageY: y, identifier: TOUCH_IDENTIFIER, timestamp: 0 };
  const touches = type === TOUCH_END ? [] : [touch];
  fabric.fireEvent(handle, type, { pageX: x, pageY: y, touches, changedTouches: [touch] });
}

function accessibilityDisabled(props: Record<string, unknown>): unknown {
  const state = props.accessibilityState;
  return isRecord(state) ? state.disabled : undefined;
}

function terminationGate(handle: unknown): ((event: unknown) => unknown) | undefined {
  if (!isRecord(handle)) return undefined;
  const listeners = handle.listeners;
  if (!(listeners instanceof Map)) return undefined;
  const gate = listeners.get(TERMINATION_REQUEST);
  return typeof gate === 'function' ? gate : undefined;
}

describe('React Pressable on the engine', () => {
  it('synthesizes onPress on start + end', () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      <Pressable
        onPress={() => {
          presses++;
        }}
      />,
    );
    const handle = responderHandle();
    fire(handle, TOUCH_START);
    fire(handle, TOUCH_END);
    expect(presses).toBe(1);
  });

  it('suppresses onPress when disabled', () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      <Pressable
        disabled
        onPress={() => {
          presses++;
        }}
      />,
    );
    const handle = responderHandle();
    fire(handle, TOUCH_START);
    fire(handle, TOUCH_END);
    expect(presses).toBe(0);
  });

  it('fires onLongPress once on a hold, suppresses the tap, and rearms for the next tap', () => {
    const DELAY = 500;
    let longPresses = 0;
    let presses = 0;
    mount(
      ROOT_TAG,
      <Pressable
        delayLongPress={DELAY}
        onLongPress={() => {
          longPresses++;
        }}
        onPress={() => {
          presses++;
        }}
      />,
    );
    const handle = responderHandle();

    // (a) full hold cycle: long press fires once, the release does NOT count a tap.
    fire(handle, TOUCH_START);
    vi.advanceTimersByTime(DELAY);
    expect(longPresses).toBe(1);
    fire(handle, TOUCH_END);
    expect(presses).toBe(0);
    expect(longPresses).toBe(1);

    // (b) a second quick tap (released before DELAY) still fires onPress.
    fire(handle, TOUCH_START);
    fire(handle, TOUCH_END);
    expect(presses).toBe(1);
    expect(longPresses).toBe(1);
  });

  it('does not long-press on a release before the delay', () => {
    const DELAY = 500;
    let longPresses = 0;
    mount(
      ROOT_TAG,
      <Pressable
        delayLongPress={DELAY}
        onLongPress={() => {
          longPresses++;
        }}
      />,
    );
    const handle = responderHandle();
    fire(handle, TOUCH_START);
    fire(handle, TOUCH_END);
    vi.advanceTimersByTime(DELAY);
    expect(longPresses).toBe(0);
  });

  it('reports accessibilityState.disabled and passes a11y props through', () => {
    mount(ROOT_TAG, <Pressable disabled accessibilityLabel="save" testID="save-btn" />);
    const props = responderProps();
    expect(accessibilityDisabled(props)).toBe(true);
    expect(props.accessibilityLabel).toBe('save');
    expect(props.testID).toBe('save-btn');
  });

  it('gives Button role=button, accessible, and a disabled a11y state', () => {
    mount(ROOT_TAG, <Button title="OK" disabled accessibilityLabel="confirm" />);
    const props = responderProps();
    expect(props.accessibilityRole).toBe('button');
    expect(props.accessible).toBe(true);
    expect(accessibilityDisabled(props)).toBe(true);
    expect(props.accessibilityLabel).toBe('confirm');
  });

  it('keeps an enabled Button role=button and not disabled', () => {
    mount(ROOT_TAG, <Button title="Go" onPress={() => {}} />);
    const props = responderProps();
    expect(props.accessibilityRole).toBe('button');
    expect(accessibilityDisabled(props)).not.toBe(true);
  });

  it('retains the press on a small drift and drops it past pressRetentionOffset', () => {
    let presses = 0;
    let pressOuts = 0;
    // hitSlop 0 + retention 30 -> threshold 30. A 10pt move retains; a 100pt move drops.
    mount(
      ROOT_TAG,
      <Pressable
        hitSlop={0}
        pressRetentionOffset={30}
        onPress={() => {
          presses++;
        }}
        onPressOut={() => {
          pressOuts++;
        }}
      />,
    );
    const handle = responderHandle();

    // (a) small drift inside the retention region -> press still fires on release.
    fireAt(handle, TOUCH_START, 100, 100);
    fireAt(handle, TOUCH_MOVE, 108, 106); // hypot(8,6) = 10 < 30 -> retained
    fireAt(handle, TOUCH_END, 108, 106);
    expect(presses).toBe(1);
    expect(pressOuts).toBe(1);

    // (b) large drift past the region -> tap suppressed, early pressOut fired.
    presses = 0;
    pressOuts = 0;
    fireAt(handle, TOUCH_START, 100, 100);
    fireAt(handle, TOUCH_MOVE, 200, 100); // 100 > 30 -> drifted out
    expect(pressOuts).toBe(1);
    fireAt(handle, TOUCH_END, 200, 100);
    expect(presses).toBe(0);
  });

  it('defers the pressed state with unstable_pressDelay', () => {
    const DELAY = 120;
    let pressIns = 0;
    let presses = 0;
    mount(
      ROOT_TAG,
      <Pressable
        unstable_pressDelay={DELAY}
        onPressIn={() => {
          pressIns++;
        }}
        onPress={() => {
          presses++;
        }}
      />,
    );
    const handle = responderHandle();

    // (a) touch-down alone does NOT activate pressIn; it is deferred behind the timer.
    fireAt(handle, TOUCH_START, 50, 50);
    expect(pressIns).toBe(0);
    // (b) advancing past the delay fires the deferred pressIn.
    vi.advanceTimersByTime(DELAY);
    expect(pressIns).toBe(1);
    fireAt(handle, TOUCH_END, 50, 50);
    expect(presses).toBe(1);

    // (c) a release BEFORE the delay still flushes the deferred press.
    pressIns = 0;
    presses = 0;
    fireAt(handle, TOUCH_START, 50, 50);
    expect(pressIns).toBe(0);
    fireAt(handle, TOUCH_END, 50, 50); // released before advancing the timer
    expect(pressIns).toBe(1);
    expect(presses).toBe(1);
  });

  it('tests the measured rect per-edge (asymmetric) for retention', () => {
    measuredFrame = { width: 100, height: 40, pageX: 0, pageY: 0 };
    let presses = 0;
    let pressOuts = 0;
    mount(
      ROOT_TAG,
      <Pressable
        pressRetentionOffset={{ right: 40 }}
        onPress={() => {
          presses++;
        }}
        onPressOut={() => {
          pressOuts++;
        }}
      />,
    );
    const handle = responderHandle();

    // (a) x=130 is inside the right edge (100+40=140) -> retained, tap fires on release.
    fireAt(handle, TOUCH_START, 50, 20);
    fireAt(handle, TOUCH_MOVE, 130, 20);
    fireAt(handle, TOUCH_END, 130, 20);
    expect(presses).toBe(1);

    // (b) y=80 is past the bottom edge (40+30=70) -> drifted out, early pressOut, tap dropped.
    presses = 0;
    pressOuts = 0;
    fireAt(handle, TOUCH_START, 50, 20);
    fireAt(handle, TOUCH_MOVE, 50, 80);
    expect(pressOuts).toBe(1);
    fireAt(handle, TOUCH_END, 50, 80);
    expect(presses).toBe(0);
  });

  it('registers a termination gate returning false for cancelable={false}', () => {
    mount(ROOT_TAG, <Pressable cancelable={false} onPress={() => {}} />);
    const gate = terminationGate(responderHandle());
    expect(gate, 'termination gate registered').toBeDefined();
    expect(gate!({ nativeEvent: {} })).toBe(false);
  });

  it('registers a termination gate returning true for cancelable', () => {
    mount(ROOT_TAG, <Pressable cancelable onPress={() => {}} />);
    const gate = terminationGate(responderHandle());
    expect(gate, 'termination gate registered').toBeDefined();
    expect(gate!({ nativeEvent: {} })).toBe(true);
  });

  it('registers no termination gate when cancelable is unset (RN implicit yes)', () => {
    mount(ROOT_TAG, <Pressable onPress={() => {}} />);
    expect(terminationGate(responderHandle())).toBeUndefined();
  });

  it('fires onPressMove on every responder move while the press is live', () => {
    let moves = 0;
    mount(
      ROOT_TAG,
      <Pressable
        onPressMove={() => {
          moves++;
        }}
        onPress={() => {}}
      />,
    );
    const handle = responderHandle();
    fireAt(handle, TOUCH_START, 50, 50);
    fireAt(handle, TOUCH_MOVE, 51, 50);
    fireAt(handle, TOUCH_MOVE, 52, 50);
    fireAt(handle, TOUCH_END, 52, 50);
    expect(moves).toBe(2);
  });
});
