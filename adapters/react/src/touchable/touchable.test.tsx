// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `touchable.smoke`. Proves TouchableOpacity drives press feedback through the Animated
// engine (not a static style toggle): pressing in runs Animated.timing toward
// activeOpacity, pressing out animates back to 1. The frames flow through the
// Animated.View leaf into the engine's scoped commit and land on the committed view's
// opacity, while the base style survives the per-frame diff. delayPressIn defers
// onPressIn past touch-down. No simulator: a failure here is in JS.
//
// rAF is polyfilled (setTimeout-based) and the clone is made to MERGE the diff onto
// existing props (real Fabric C++ behavior; the shared recorder replaces) so the base
// width survives the opacity-only per-frame diff, installed before any mount because the
// engine destructures slot methods off the global on its first commit.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, TouchableOpacity } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 120;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const ACTIVE_OPACITY = 0.3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function mergeProps(
  previous: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...previous, ...patch };
  for (const key of Object.keys(patch)) {
    if (patch[key] === null) delete merged[key];
  }
  return merged;
}

const fabric = installFabric();
const installed: unknown = globalThis.nativeFabricUIManager;
if (!isRecord(installed)) throw new Error('fabric slot was not installed');

installed.cloneNodeWithNewProps = (node: IFakeNode, patch: Record<string, unknown>): IFakeNode => ({
  ...node,
  props: mergeProps(node.props, patch),
});
installed.cloneNodeWithNewChildrenAndProps = (
  node: IFakeNode,
  patch: Record<string, unknown>,
): IFakeNode => ({ ...node, props: mergeProps(node.props, patch), children: [] });
// Pressable measures its responder rect on grant (retention region); report a fixed frame.
installed.measure = (
  _node: IFakeNode,
  cb: (x: number, y: number, w: number, h: number, px: number, py: number) => void,
): void => cb(0, 0, 100, 40, 0, 0);

// rAF polyfill: the drivers read requestAnimationFrame from the host at call time; a
// setTimeout-based clock advancing 16ms per frame lets .start() run to completion.
let frameClock = 0;
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const cb = pendingFrames.get(id);
        if (cb !== undefined) {
          pendingFrames.delete(id);
          frameClock += 16;
          cb(frameClock);
        }
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

async function flushFrames(): Promise<void> {
  let guard = 0;
  while (pendingFrames.size > 0 && guard < 1_000) {
    guard++;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  pendingFrames.clear();
  nextFrameId = 1;
  installRequestAnimationFrame();
});
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

// The responder is the Pressable's own RCTView, the first non-box-none RCTView created.
function responderHandle(): unknown {
  const view = fabric.find(n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none');
  if (!view) throw new Error('no RCTView (Pressable responder) was created');
  return view.instanceHandle;
}

// The Animated.View carrying the opacity feedback is the DEEPEST committed non-box-none
// RCTView (the inner Animated.View, child of the Pressable's responder View).
function feedbackProps(): Record<string, unknown> {
  let found: Record<string, unknown> | undefined;
  function walk(node: IFakeNode): void {
    if (node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none') {
      found = node.props;
    }
    for (const child of node.children) walk(child);
  }
  for (const root of fabric.committed) walk(root);
  if (found === undefined) throw new Error('no committed RCTView found');
  return found;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number')
    throw new Error(`${label} should be a number, got ${JSON.stringify(value)}`);
  return value;
}

describe('React TouchableOpacity animated feedback', () => {
  it('animates opacity to activeOpacity on press-in and back to 1 on press-out', async () => {
    let pressIns = 0;
    let pressOuts = 0;
    let presses = 0;

    function App(): ReactElement {
      return (
        <TouchableOpacity
          activeOpacity={ACTIVE_OPACITY}
          style={{ width: 10 }}
          onPress={() => {
            presses++;
          }}
          onPressIn={() => {
            pressIns++;
          }}
          onPressOut={() => {
            pressOuts++;
          }}
        />
      );
    }
    mount(ROOT_TAG, <App />);

    const handle = responderHandle();

    // At rest opacity sits at 1 and keeps base style.
    const rest = feedbackProps();
    expect(asNumber(rest.opacity, 'resting opacity')).toBe(1);
    expect(rest.width).toBe(10);

    // Press in: the timing animation runs toward activeOpacity.
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    const active = feedbackProps();
    const activeOpacity = asNumber(active.opacity, 'pressed opacity');
    expect(activeOpacity).toBeLessThan(1);
    expect(activeOpacity).toBeCloseTo(ACTIVE_OPACITY, 6);
    expect(active.width).toBe(10);

    // Press out: the timing animation runs back to 1.
    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'released opacity')).toBeCloseTo(1, 6);

    // A full start+end synthesizes onPress; pressIn/pressOut each fired once.
    expect(presses).toBe(1);
    expect(pressIns).toBe(1);
    expect(pressOuts).toBe(1);
  });

  it('defers onPressIn past touch-down with delayPressIn', async () => {
    const DELAY = 30;
    let deferredPressIns = 0;

    function App(): ReactElement {
      return (
        <TouchableOpacity
          delayPressIn={DELAY}
          onPressIn={() => {
            deferredPressIns++;
          }}
          onPress={() => {}}
        />
      );
    }
    mount(ROOT_TAG, <App />);

    fabric.fireEvent(responderHandle(), TOUCH_START);
    expect(deferredPressIns).toBe(0);
    await new Promise(resolve => setTimeout(resolve, DELAY + 20));
    expect(deferredPressIns).toBe(1);
  });
});
