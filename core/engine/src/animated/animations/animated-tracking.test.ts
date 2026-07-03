// Co-located unit test (ADR 0025), ported from the headless `animated-tracking.smoke.tsx`.
// Tracking: Animated.timing/spring with `toValue: anotherValue` makes a value CHASE a moving
// target. (A) public API wiring: timing(f, { toValue: t }).start() attaches a tracking node as a
// child of the target, and stop() tears it down. (B) mechanism: driving an AnimatedTracking with
// an instant fake driver, changing the target re-launches toward the new value, and stopping
// detaches it. The fake driver keeps the test off the real timeline.

import { beforeAll, describe, expect, it } from 'vitest';
import { AnimatedValue, AnimatedTracking, timing } from '@symbiotejs/engine';
import type { IAnimation, IEndCallback } from '@symbiotejs/engine';

// Part A starts a real TimingAnimation (to prove the public wiring), which needs a host rAF. We
// never advance a frame, so a no-op rAF that never fires is enough.
beforeAll(() => {
  Object.assign(globalThis, {
    requestAnimationFrame: (): number => 1,
    cancelAnimationFrame: (): void => {},
  });
});

// An instant driver: jump straight to the target and finish. Lets us assert the tracking wiring
// without advancing real frames.
function instantTo(target: number): IAnimation {
  return {
    start(_fromValue: number, onUpdate: (value: number) => void, onEnd: IEndCallback): void {
      onUpdate(target);
      onEnd({ finished: true });
    },
    stop(): void {},
  };
}

describe('Animated tracking', () => {
  it('timing(toValue: node) attaches a tracking node onto the target, and stop() detaches it', () => {
    const follower = new AnimatedValue(0);
    const target = new AnimatedValue(10);

    const anim = timing(follower, { toValue: target, duration: 100 });
    anim.start();
    expect(target.__getChildren().length).toBeGreaterThanOrEqual(1);

    anim.stop();
    expect(target.__getChildren()).toHaveLength(0);
  });

  it('re-launches on target change and stops chasing on detach', () => {
    const follower = new AnimatedValue(0);
    const target = new AnimatedValue(10);

    const tracking = new AnimatedTracking(follower, target, toValue => instantTo(toValue));
    follower.track(tracking);
    // track() immediately launches toward the target's current value.
    expect(follower.__getValue()).toBe(10);

    // The target moves -> the follower chases it (re-launch via the leaf update).
    target.setValue(25);
    expect(follower.__getValue()).toBe(25);

    // Stopping the follower detaches the tracking; further target moves are ignored.
    follower.stopAnimation();
    target.setValue(99);
    expect(follower.__getValue()).toBe(25);
    expect(target.__getChildren()).toHaveLength(0);
  });
});
