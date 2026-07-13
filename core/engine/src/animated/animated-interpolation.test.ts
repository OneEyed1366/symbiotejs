// Unit test for AnimatedInterpolation's non-numeric output ranges: a value-with-units string range
// interpolates the number and re-appends the unit, a color range interpolates channel-wise
// and emits an rgba() string in RN's format (r,g,b rounded, alpha continuous), and the scalar
// number->number path stays untouched. Pure functions, so no Fabric slot.

import { describe, expect, it } from 'vitest';
import { AnimatedNode, AnimatedValue } from '@symbiote-native/engine';

describe('AnimatedNode.interpolate — the base-class implementation', () => {
  it('works on a plain AnimatedNode subclass with no interpolate override of its own', () => {
    // A bare AnimatedNode subclass (not AnimatedValue, not any of the operator
    // classes): none of those per-class interpolate() overrides can be reached from
    // here, so a passing __getValue() proves the method lives on AnimatedNode itself.
    class BareValueNode extends AnimatedNode {
      constructor(private readonly value: number) {
        super();
      }

      override __getValue(): number {
        return this.value;
      }
    }

    const bare = new BareValueNode(0.5);
    const doubled = bare.interpolate({ inputRange: [0, 1], outputRange: [0, 2] });

    expect(doubled.__getValue()).toBe(1);
  });
});

describe('AnimatedInterpolation non-numeric output ranges', () => {
  it("interpolates a degrees string ('0deg' -> '360deg') at 0.5", () => {
    const deg = new AnimatedValue(0.5).interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });
    expect(deg.__getValue()).toBe('180deg');
  });

  it('keeps a fractional unit template shape at the endpoint', () => {
    const rad = new AnimatedValue(1).interpolate({
      inputRange: [0, 1],
      outputRange: ['1.5rad', '3rad'],
    });
    expect(rad.__getValue()).toBe('3rad');
  });

  it('interpolates a percent token in place at 0.25', () => {
    const percent = new AnimatedValue(0.25).interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });
    expect(percent.__getValue()).toBe('25%');
  });

  it("interpolates a hex color range to mid-gray rgba() ('#000000' -> '#ffffff')", () => {
    const gray = new AnimatedValue(0.5).interpolate({
      inputRange: [0, 1],
      outputRange: ['#000000', '#ffffff'],
    });
    // (255 * 0.5) rounds to 128 per channel; alpha stays 1.
    expect(gray.__getValue()).toBe('rgba(128, 128, 128, 1)');
  });

  it('interpolates rgba() channels AND continuous alpha at 0.5', () => {
    const fade = new AnimatedValue(0.5).interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(0, 0, 0, 0)', 'rgba(100, 200, 40, 1)'],
    });
    expect(fade.__getValue()).toBe('rgba(50, 100, 20, 0.5)');
  });

  it('leaves the scalar number->number path untouched', () => {
    const scalar = new AnimatedValue(0.5).interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });
    expect(scalar.__getValue()).toBe(50);
  });
});
