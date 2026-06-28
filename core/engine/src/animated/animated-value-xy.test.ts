// Co-located unit test (ADR 0025), ported from the headless `animated-value-xy.smoke.tsx`.
// AnimatedValueXY is not a driving node. It multiplexes two ordinary AnimatedValues, so this
// is pure JS, no native module and no Fabric slot. We assert getLayout()/getTranslateTransform()
// hand back the LIVE x/y values, setValue updates both axes, and a combined listener fires
// with {x, y}.

import { describe, expect, it } from 'vitest';
import { AnimatedValue } from '@symbiote/engine';
import { AnimatedValueXY } from './value-xy';

describe('AnimatedValueXY', () => {
  it('wires getLayout() to the live x/y values', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const layout = xy.getLayout();
    expect(layout.left).toBe(xy.x);
    expect(layout.top).toBe(xy.y);
    expect(layout.left.__getValue()).toBe(1);
    expect(layout.top.__getValue()).toBe(2);
  });

  it('wires getTranslateTransform() to the live x/y values', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const transform = xy.getTranslateTransform();
    expect(transform).toHaveLength(2);
    expect(transform[0].translateX).toBe(xy.x);
    expect(transform[1].translateY).toBe(xy.y);
  });

  it('setValue updates both axes and stays visible through getLayout', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const layout = xy.getLayout();
    xy.setValue({ x: 10, y: 20 });
    expect(xy.__getValue()).toEqual({ x: 10, y: 20 });
    expect(layout.left.__getValue()).toBe(10);
    expect(layout.top.__getValue()).toBe(20);
  });

  it('fires a combined listener with the fully-updated 2D value', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const events: { x: number; y: number }[] = [];
    xy.addListener(value => {
      events.push({ x: value.x, y: value.y });
    });
    xy.setValue({ x: 3, y: 4 });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[events.length - 1]).toEqual({ x: 3, y: 4 });
  });

  it('removeListener detaches both axes', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    const events: { x: number; y: number }[] = [];
    const listenerId = xy.addListener(value => {
      events.push({ x: value.x, y: value.y });
    });
    xy.setValue({ x: 3, y: 4 });
    const countBefore = events.length;
    xy.removeListener(listenerId);
    xy.setValue({ x: 5, y: 6 });
    expect(events).toHaveLength(countBefore);
  });

  it('holds a real AnimatedValue as its x child', () => {
    const xy = new AnimatedValueXY({ x: 1, y: 2 });
    expect(xy.x).toBeInstanceOf(AnimatedValue);
  });
});
