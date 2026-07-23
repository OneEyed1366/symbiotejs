import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_PEDOMETER = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  getStepCountAsync: vi.fn(async () => ({ steps: 42 })),
  isAvailableAsync: vi.fn(async () => true),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
};

// The real ExponentPedometer native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-pedometer', () => ({
  exponentPedometer: FAKE_NATIVE_PEDOMETER,
}));

// pedometer.ts pulls PermissionStatus/UnavailabilityError from expo-modules-core, whose real
// entry transitively drags in the Flow-typed 'react-native' source that Vitest's Oxc transform
// can't parse — same fake as device-sensor.test.ts / accelerometer.test.ts.
vi.mock('expo-modules-core', () => ({
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  watchStepCount,
  getStepCountAsync,
  isAvailableAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
} = await import('./pedometer');

afterEach(() => {
  vi.clearAllMocks();
});

describe('Pedometer', () => {
  it('watchStepCount subscribes through the dotted Exponent.pedometerUpdate event name', () => {
    const listener = vi.fn();
    watchStepCount(listener);

    expect(FAKE_NATIVE_PEDOMETER.addListener).toHaveBeenCalledWith(
      'Exponent.pedometerUpdate',
      listener,
    );
  });

  it('getStepCountAsync throws when the start date is after the end date', async () => {
    const start = new Date('2026-07-15T00:00:00Z');
    const end = new Date('2026-07-01T00:00:00Z');

    await expect(getStepCountAsync(start, end)).rejects.toThrow(
      'Pedometer: the start date must precede the end date.',
    );
    expect(FAKE_NATIVE_PEDOMETER.getStepCountAsync).not.toHaveBeenCalled();
  });

  it('getStepCountAsync throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { getStepCountAsync: nativeGetStepCountAsync } = FAKE_NATIVE_PEDOMETER;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_PEDOMETER.getStepCountAsync = undefined;

    const start = new Date('2026-07-01T00:00:00Z');
    const end = new Date('2026-07-15T00:00:00Z');

    await expect(getStepCountAsync(start, end)).rejects.toThrow(
      'getStepCountAsync is not available on ExponentPedometer',
    );

    FAKE_NATIVE_PEDOMETER.getStepCountAsync = nativeGetStepCountAsync;
  });

  it('getStepCountAsync calls through with millisecond values from each Date', async () => {
    const start = new Date('2026-07-01T00:00:00Z');
    const end = new Date('2026-07-15T00:00:00Z');

    const result = await getStepCountAsync(start, end);

    expect(FAKE_NATIVE_PEDOMETER.getStepCountAsync).toHaveBeenCalledWith(
      start.getTime(),
      end.getTime(),
    );
    expect(result).toEqual({ steps: 42 });
  });

  it('isAvailableAsync delegates to the native module', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
    expect(FAKE_NATIVE_PEDOMETER.isAvailableAsync).toHaveBeenCalledTimes(1);
  });

  it('falls back to a granted default permission response when the native module has none', async () => {
    const {
      getPermissionsAsync: nativeGetPermissionsAsync,
      requestPermissionsAsync: nativeRequestPermissionsAsync,
    } = FAKE_NATIVE_PEDOMETER;
    // @ts-expect-error -- simulating a platform where the native module exposes no permission methods
    FAKE_NATIVE_PEDOMETER.getPermissionsAsync = undefined;
    // @ts-expect-error -- simulating a platform where the native module exposes no permission methods
    FAKE_NATIVE_PEDOMETER.requestPermissionsAsync = undefined;

    const expectedDefault = {
      granted: true,
      expires: 'never',
      canAskAgain: true,
      status: 'granted',
    };
    await expect(getPermissionsAsync()).resolves.toEqual(expectedDefault);
    await expect(requestPermissionsAsync()).resolves.toEqual(expectedDefault);

    FAKE_NATIVE_PEDOMETER.getPermissionsAsync = nativeGetPermissionsAsync;
    FAKE_NATIVE_PEDOMETER.requestPermissionsAsync = nativeRequestPermissionsAsync;
  });
});
