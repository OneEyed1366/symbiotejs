import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_ACCELEROMETER = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExponentAccelerometer native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-accelerometer', () => ({
  exponentAccelerometer: FAKE_NATIVE_ACCELEROMETER,
}));

// device-sensor.ts (imported transitively through ./accelerometer) pulls Platform/PermissionStatus
// from expo-modules-core, whose real entry drags in the Flow-typed 'react-native' source that
// Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { Accelerometer } = await import('./accelerometer');

afterEach(() => {
  Accelerometer.removeAllListeners();
  vi.clearAllMocks();
});

describe('Accelerometer', () => {
  it('sets the update interval', () => {
    Accelerometer.setUpdateInterval(1234);

    expect(FAKE_NATIVE_ACCELEROMETER.setUpdateInterval).toHaveBeenCalledTimes(1);
    expect(FAKE_NATIVE_ACCELEROMETER.setUpdateInterval).toHaveBeenCalledWith(1234);
  });

  it('subscribes through the shared accelerometerDidUpdate event name', () => {
    const listener = vi.fn();
    Accelerometer.addListener(listener);

    expect(FAKE_NATIVE_ACCELEROMETER.addListener).toHaveBeenCalledWith(
      'accelerometerDidUpdate',
      listener,
    );
  });
});
