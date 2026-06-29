// Co-located unit test (ADR 0025): the StyleSheet API. create/flatten/compose/absoluteFill run
// against plain objects; for hairlineWidth we install a fake __turboModuleProxy so
// getNativeModule('DeviceInfo') returns a known screen scale, then assert the width matches RN's
// formula for that scale.

import { describe, expect, it } from 'vitest';
import { StyleSheet, computeHairlineWidth } from './index';

describe('StyleSheet', () => {
  describe('create', () => {
    it('is identity — input entries are preserved', () => {
      const input = { box: { flex: 1, padding: 8 }, title: { color: 'red' } };
      const created = StyleSheet.create(input);
      expect(created).toEqual(input);
      expect(created.box.flex).toBe(1);
    });
  });

  describe('flatten', () => {
    it('merges with later keys winning (reuses shared flattenStyle)', () => {
      expect(StyleSheet.flatten([{ a: 1 }, { a: 2, b: 3 }])).toEqual({ a: 2, b: 3 });
    });
  });

  describe('absoluteFill', () => {
    it('is four zeroed insets plus position absolute', () => {
      expect(StyleSheet.absoluteFill).toEqual({
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      });
    });

    it('is the same object as absoluteFillObject', () => {
      expect(StyleSheet.absoluteFill).toBe(StyleSheet.absoluteFillObject);
    });
  });

  describe('compose (RN semantics)', () => {
    const x = { a: 1 };
    const y = { b: 2 };

    it('returns a pair when both are present', () => {
      expect(StyleSheet.compose(x, y)).toEqual([x, y]);
    });

    it('returns the present side when the other is nullish', () => {
      expect(StyleSheet.compose(x, undefined)).toBe(x);
      expect(StyleSheet.compose(undefined, y)).toBe(y);
    });

    it('returns null when both are null', () => {
      expect(StyleSheet.compose(null, null)).toBeNull();
    });
  });

  describe('hairlineWidth', () => {
    const FAKE_SCALE = 3;

    it('matches RN formula for the faked DeviceInfo screen scale', () => {
      Object.assign(globalThis, {
        __turboModuleProxy: <T>(name: string): T | null => {
          if (name !== 'DeviceInfo') return null;
          const deviceInfo = {
            getConstants: () => ({ Dimensions: { window: { scale: FAKE_SCALE } } }),
          };
          return isType<T>(deviceInfo) ? deviceInfo : null;
        },
      });

      const width = StyleSheet.hairlineWidth;
      expect(typeof width).toBe('number');
      expect(width).toBeGreaterThan(0);
      expect(width).toBe(computeHairlineWidth(FAKE_SCALE));
    });
  });
});

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}
