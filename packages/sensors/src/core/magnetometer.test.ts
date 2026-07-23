import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_MAGNETOMETER = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExponentMagnetometer native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-magnetometer', () => ({
  exponentMagnetometer: FAKE_NATIVE_MAGNETOMETER,
}));

// device-sensor.ts (imported transitively through ./magnetometer) pulls Platform/PermissionStatus
// from expo-modules-core, whose real entry drags in the Flow-typed 'react-native' source that
// Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { Magnetometer } = await import('./magnetometer');

afterEach(() => {
  Magnetometer.removeAllListeners();
  vi.clearAllMocks();
});

describe('Magnetometer', () => {
  it('sets the update interval', () => {
    Magnetometer.setUpdateInterval(1234);

    expect(FAKE_NATIVE_MAGNETOMETER.setUpdateInterval).toHaveBeenCalledTimes(1);
    expect(FAKE_NATIVE_MAGNETOMETER.setUpdateInterval).toHaveBeenCalledWith(1234);
  });

  it('subscribes through the shared magnetometerDidUpdate event name', () => {
    const listener = vi.fn();
    Magnetometer.addListener(listener);

    expect(FAKE_NATIVE_MAGNETOMETER.addListener).toHaveBeenCalledWith(
      'magnetometerDidUpdate',
      listener,
    );
  });
});
