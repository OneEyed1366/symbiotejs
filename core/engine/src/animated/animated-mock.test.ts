// Co-located unit test (ADR 0025), ported from the headless `animated-mock.smoke.ts`.
// AnimatedMock (RN's AnimatedMock.js): when the host reports Platform.isDisableAnimations,
// react/animated swaps the live drivers for this mock: every animation jumps straight to its
// final value and fires the end callback SYNCHRONOUSLY (no frames). The Fabric slot is only here
// so setValue's flush path doesn't throw; no view is attached.

import { describe, expect, it } from 'vitest';
import { AnimatedValue, AnimatedMock } from '@symbiote/engine';
import type { IEndResult } from '@symbiote/engine';
import { installFabric } from '@symbiote/test-utils';

installFabric();

describe('AnimatedMock', () => {
  it('timing jumps to toValue synchronously and fires the callback exactly once', () => {
    const value = new AnimatedValue(0);
    const frames: number[] = [];
    value.addListener(({ value: v }) => frames.push(v));

    let endCount = 0;
    let landedValue = -1;
    let finishedInCallback = false;
    AnimatedMock.timing(value, { toValue: 1, duration: 10_000 }).start((result: IEndResult) => {
      endCount += 1;
      finishedInCallback = result.finished;
      // The callback runs INSIDE start(): value is already final here, no await.
      landedValue = value.__getValue();
    });

    expect(finishedInCallback).toBe(true);
    // No frame loop ran: even with a 10s duration the value is already at the target.
    expect(value.__getValue()).toBe(1);
    expect(landedValue).toBe(1);
    expect(endCount).toBe(1);
    expect(frames).toEqual([1]);
  });

  it('spring jumps to toValue synchronously', () => {
    const value = new AnimatedValue(0);
    let finished = false;
    AnimatedMock.spring(value, { toValue: 42, stiffness: 200, damping: 20 }).start(result => {
      finished = result.finished;
    });
    expect(value.__getValue()).toBe(42);
    expect(finished).toBe(true);
  });

  it('decay is the empty animation: value untouched, no callback', () => {
    const value = new AnimatedValue(7);
    let called = false;
    AnimatedMock.decay(value, { velocity: 1 }).start(() => {
      called = true;
    });
    expect(value.__getValue()).toBe(7);
    expect(called).toBe(false);
  });

  it('sequence jumps its members synchronously', () => {
    const a = new AnimatedValue(0);
    const b = new AnimatedValue(0);
    let seqFinished = false;
    AnimatedMock.sequence([
      AnimatedMock.timing(a, { toValue: 1, duration: 5_000 }),
      AnimatedMock.timing(b, { toValue: 2, duration: 5_000 }),
    ]).start(result => {
      seqFinished = result.finished;
    });
    expect(a.__getValue()).toBe(1);
    expect(b.__getValue()).toBe(2);
    expect(seqFinished).toBe(true);
  });

  it('parallel jumps its members synchronously', () => {
    const c = new AnimatedValue(0);
    const d = new AnimatedValue(0);
    let parFinished = false;
    AnimatedMock.parallel([
      AnimatedMock.timing(c, { toValue: 3, duration: 5_000 }),
      AnimatedMock.timing(d, { toValue: 4, duration: 5_000 }),
    ]).start(result => {
      parFinished = result.finished;
    });
    expect(c.__getValue()).toBe(3);
    expect(d.__getValue()).toBe(4);
    expect(parFinished).toBe(true);
  });
});
