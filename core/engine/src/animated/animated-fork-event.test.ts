// Co-located unit test (ADR 0025), ported from the headless `animated-fork-event.smoke.ts`.
// forkEvent / unforkEvent (RN AnimatedImplementation.js ~519-538). Pure JS, no Fabric slot.

import { describe, expect, it } from 'vitest';
import { AnimatedValue, event, forkEvent, unforkEvent } from '@symbiotejs/engine';

describe('forkEvent / unforkEvent', () => {
  it('returns the new listener as the handler when existing is undefined', () => {
    let solo = 0;
    const fromNothing = forkEvent(undefined, () => {
      solo += 1;
    });
    fromNothing({ nativeEvent: {} });
    expect(solo).toBe(1);
  });

  it('appends to an AnimatedEvent, returns the SAME handler, and still drives the value', () => {
    const scrollY = new AnimatedValue(0);
    const calls: string[] = [];
    const handler = event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      listener: () => calls.push('config'),
    });
    const extra = (): void => {
      calls.push('forked');
    };
    const forked = forkEvent(handler, extra);
    expect(forked).toBe(handler);

    forked({ nativeEvent: { contentOffset: { y: 25 } } });
    expect(scrollY.__getValue()).toBe(25);
    expect(calls).toEqual(['config', 'forked']);
  });

  it('unforkEvent removes a forked listener from an AnimatedEvent while the value still drives', () => {
    const scrollY = new AnimatedValue(0);
    const calls: string[] = [];
    const handler = event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      listener: () => calls.push('config'),
    });
    const extra = (): void => {
      calls.push('forked');
    };
    const forked = forkEvent(handler, extra);
    forked({ nativeEvent: { contentOffset: { y: 25 } } });

    calls.length = 0;
    unforkEvent(forked, extra);
    forked({ nativeEvent: { contentOffset: { y: 30 } } });
    expect(scrollY.__getValue()).toBe(30);
    expect(calls).toEqual(['config']);
  });

  it('combines a plain-function existing into a NEW function calling both in order', () => {
    const order: string[] = [];
    const base = (): void => {
      order.push('base');
    };
    const combined = forkEvent(base, () => order.push('added'));
    expect(combined).not.toBe(base);
    combined({ nativeEvent: {} });
    expect(order).toEqual(['base', 'added']);
  });

  it('unforkEvent on a plain-function fork is a no-op (must not throw)', () => {
    const base = (): void => {};
    const combined = forkEvent(base, () => {});
    expect(() => unforkEvent(combined, base)).not.toThrow();
  });
});
