// Co-located unit test (ADR 0025): PixelRatio, pure JS, no mounting. PixelRatio derives
// every value from the Dimensions singleton, so a fake __turboModuleProxy returns a
// DeviceInfo module whose getConstants() ships known window metrics; PixelRatio is then
// imported fresh (after vi.resetModules) so it resolves the seeded Dimensions.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

interface IWindowMetrics {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
}

const WINDOW: IWindowMetrics = { width: 400, height: 800, scale: 3, fontScale: 2 };
const LAYOUT_SIZE = 10;
const ODD_LAYOUT_SIZE = 8.333;

let PixelRatio: typeof import('./index').PixelRatio;

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

beforeEach(async () => {
  const fakeDeviceInfo = {
    getConstants: (): { Dimensions: { window: IWindowMetrics } } => ({
      Dimensions: { window: WINDOW },
    }),
  };
  const registeredModules: Record<string, unknown> = { DeviceInfo: fakeDeviceInfo };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (): void => {};

  vi.resetModules();
  ({ PixelRatio } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

describe('PixelRatio', () => {
  it('get() returns the window pixel scale', () => {
    expect(PixelRatio.get()).toBe(WINDOW.scale);
  });

  it('getFontScale() returns the window font scale', () => {
    expect(PixelRatio.getFontScale()).toBe(WINDOW.fontScale);
  });

  it('getPixelSizeForLayoutSize() converts dp to a whole-pixel integer', () => {
    expect(PixelRatio.getPixelSizeForLayoutSize(LAYOUT_SIZE)).toBe(LAYOUT_SIZE * WINDOW.scale);
  });

  it('roundToNearestPixel() snaps a dp size to the physical pixel grid', () => {
    const expected = Math.round(ODD_LAYOUT_SIZE * WINDOW.scale) / WINDOW.scale;
    expect(PixelRatio.roundToNearestPixel(ODD_LAYOUT_SIZE)).toBe(expected);
  });

  it('startDetecting() is a no-op that does not throw', () => {
    expect(() => PixelRatio.startDetecting()).not.toThrow();
  });
});
