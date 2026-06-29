// Co-located unit test (ADR 0025) for the screen-metrics modules: Dimensions (engine),
// PixelRatio and useWindowDimensions. A fake __turboModuleProxy returns a DeviceInfo module
// whose getConstants() ships known window metrics; a fake RN$registerCallableModule captures
// the device hub so the test can play "native" and emit 'didUpdateDimensions'.
//
// PixelRatio now lives in the engine alongside Dimensions; useWindowDimensions still lives in
// the React adapter (it depends on React) and is imported across the boundary to preserve the
// smoke's coverage. Both resolve the SAME Dimensions singleton via `@symbiote/engine`, so the
// fake seeds them all.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}
interface IWindowMetrics {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
}

const INITIAL_WINDOW: IWindowMetrics = { width: 400, height: 800, scale: 3, fontScale: 2 };

let Dimensions: typeof import('@symbiote/engine').Dimensions;
let PixelRatio: typeof import('@symbiote/engine').PixelRatio;
let useWindowDimensions: typeof import('../../../../adapters/react/src/use-window-dimensions').useWindowDimensions;

let deviceHub: IDeviceHub | undefined;

beforeEach(async () => {
  deviceHub = undefined;

  const fakeDeviceInfo = {
    getConstants: (): { Dimensions: { window: IWindowMetrics } } => ({
      Dimensions: { window: INITIAL_WINDOW },
    }),
  };
  const registeredModules: Record<string, unknown> = { DeviceInfo: fakeDeviceInfo };

  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };

  vi.resetModules();
  ({ Dimensions, PixelRatio } = await import('@symbiote/engine'));
  ({ useWindowDimensions } = await import('../../../../adapters/react/src/use-window-dimensions'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('Dimensions / PixelRatio (initial metrics)', () => {
  it('seeds the window metrics from DeviceInfo.getConstants()', () => {
    expect(Dimensions.get('window').width).toBe(400);
  });

  it('mirrors window into screen when iOS gives no screen metrics', () => {
    expect(Dimensions.get('screen').width).toBe(400);
  });

  it('PixelRatio reads scale, fontScale, and the conversion helpers', () => {
    expect(PixelRatio.get()).toBe(3);
    expect(PixelRatio.getFontScale()).toBe(2);
    expect(PixelRatio.getPixelSizeForLayoutSize(10)).toBe(30);

    const expected = Math.round(8.333 * 3) / 3;
    expect(PixelRatio.roundToNearestPixel(8.333)).toBe(expected);
  });
});

describe('Dimensions change events', () => {
  it("a 'change' listener fires with fresh metrics and the cache updates", () => {
    let changed: { window: { width: number } } | undefined;
    // Subscribing resolves Dimensions, which installs the device hub.
    Dimensions.addEventListener('change', set => {
      changed = set;
    });
    expect(deviceHub).toBeDefined();

    const nextWindow: IWindowMetrics = { width: 500, height: 900, scale: 3, fontScale: 2 };
    deviceHub?.emit('didUpdateDimensions', { window: nextWindow });

    expect(changed?.window.width).toBe(500);
    expect(Dimensions.get('window').width).toBe(500);
  });

  it('a removed listener stops firing while the cache keeps tracking updates', () => {
    let changed: { window: { width: number } } | undefined;
    const sub = Dimensions.addEventListener('change', set => {
      changed = set;
    });
    expect(deviceHub).toBeDefined();

    sub.remove();
    deviceHub?.emit('didUpdateDimensions', {
      window: { width: 600, height: 900, scale: 3, fontScale: 2 },
    });

    expect(changed).toBeUndefined();
    // The cache still tracks the latest update even with no listeners.
    expect(Dimensions.get('window').width).toBe(600);
  });
});

describe('useWindowDimensions', () => {
  it('is a function seeded from the current Dimensions.get(window)', () => {
    expect(typeof useWindowDimensions).toBe('function');
    expect(Dimensions.get('window').width).toBe(400);
  });
});
