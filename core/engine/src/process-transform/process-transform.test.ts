// Co-located unit test (ADR 0025): `processTransform` is pure: a STRING transform is
// JS-parsed before Fabric (RN's stock path, enableNativeCSSParsing defaults to false) and an
// ARRAY transform passes through UNCHANGED by reference (the animated / sticky-header hot
// path). Expected string outputs are RN-exact.

import { describe, expect, it } from 'vitest';
import { processTransform } from './index';

describe('processTransform', () => {
  describe('array input — no-regression passthrough', () => {
    it('returns a single rotate entry unchanged', () => {
      expect(processTransform([{ rotate: '6deg' }])).toEqual([{ rotate: '6deg' }]);
    });

    it('returns a numeric translateY entry unchanged', () => {
      expect(processTransform([{ translateY: 12 }])).toEqual([{ translateY: 12 }]);
    });

    it('returns a multi-entry array unchanged', () => {
      expect(processTransform([{ translateX: '50%' }, { scale: 1.2 }])).toEqual([
        { translateX: '50%' },
        { scale: 1.2 },
      ]);
    });

    it('returns the SAME reference (no clone) so the commit flush diffs it as unchanged', () => {
      const input = [{ rotate: '6deg' }];
      expect(processTransform(input)).toBe(input);
    });
  });

  describe('string input — RN-exact CSS parse into the entry array', () => {
    it("parses 'rotate(6deg)'", () => {
      expect(processTransform('rotate(6deg)')).toEqual([{ rotate: '6deg' }]);
    });

    it("parses 'translateX(10px)' to a number", () => {
      expect(processTransform('translateX(10px)')).toEqual([{ translateX: 10 }]);
    });

    it("parses 'scale(1.5)'", () => {
      expect(processTransform('scale(1.5)')).toEqual([{ scale: 1.5 }]);
    });

    it("normalizes 'translate(x, y)' to a [x, y] numeric array", () => {
      expect(processTransform('translate(10px, 20px)')).toEqual([{ translate: [10, 20] }]);
    });

    it('gives a single-axis translate an implicit y of 0', () => {
      expect(processTransform('translate(1px)')).toEqual([{ translate: [1, 0] }]);
    });

    it('parses a percentage translateX axis to a number', () => {
      expect(processTransform('translateX(10%)')).toEqual([{ translateX: 10 }]);
    });

    it('yields an empty array for an empty string', () => {
      expect(processTransform('')).toEqual([]);
    });

    it('yields an empty array for undefined', () => {
      expect(processTransform(undefined)).toEqual([]);
    });
  });
});
