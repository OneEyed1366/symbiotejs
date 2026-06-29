// Co-located React-driven test (ADR 0025), ported from the headless `animated-integration.smoke`.
// End-to-end proof of the whole Animated stack (Phase 2 integration): a real driver
// (Animated.timing) moves an Animated.Value, whose frames flow through the component bridge's
// AnimatedProps leaf into the engine's setNativeProps (a scoped commit per frame), landing on the
// committed view. No simulator.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote/react';
import { Easing } from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

// rAF is not a Node global; polyfill it (setTimeout-based) before any driver runs. The drivers read
// requestAnimationFrame from the host at call time, so installing it per-test (before .start()) is
// enough. Each frame advances a virtual clock by 16ms.
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

const fabric = installFabric();
const ROOT_TAG = 41;

function appView(): IFakeNode {
  return fabric.appRoot().children[0];
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

describe('Animated timing integration', () => {
  it('drives an Animated.View opacity to 1 through real timing frames', async () => {
    const opacity = new Animated.Value(0);

    function App(): ReactElement {
      return <Animated.View style={{ opacity }} />;
    }

    mount(ROOT_TAG, <App />);
    expect(appView().props.opacity).toBe(0);

    const frames: number[] = [];
    const opacityListener = opacity.addListener(({ value }) => {
      frames.push(value);
    });

    const finished = await new Promise<boolean>(resolve => {
      Animated.timing(opacity, { toValue: 1, duration: 80, easing: Easing.linear }).start(
        result => {
          resolve(result.finished);
        },
      );
    });

    opacity.removeListener(opacityListener);

    expect(finished).toBe(true);
    expect(appView().props.opacity).toBe(1);
    expect(frames.length).toBeGreaterThanOrEqual(2);

    const middle = frames[Math.floor(frames.length / 2)];
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
  });
});
