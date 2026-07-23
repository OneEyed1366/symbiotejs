import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExponentMagnetometerUncalibrated native module only exists on device — resolving it
// via requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-magnetometer-uncalibrated', () => ({
  exponentMagnetometerUncalibrated: FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED,
}));

// device-sensor.ts (imported transitively through ./magnetometer-uncalibrated) pulls
// Platform/PermissionStatus from expo-modules-core, whose real entry drags in the Flow-typed
// 'react-native' source that Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { MagnetometerUncalibrated } = await import('./magnetometer-uncalibrated');

afterEach(() => {
  MagnetometerUncalibrated.removeAllListeners();
  vi.clearAllMocks();
});

describe('MagnetometerUncalibrated', () => {
  it('sets the update interval', () => {
    MagnetometerUncalibrated.setUpdateInterval(1234);

    expect(FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED.setUpdateInterval).toHaveBeenCalledTimes(1);
    expect(FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED.setUpdateInterval).toHaveBeenCalledWith(1234);
  });

  it('subscribes through the shared magnetometerUncalibratedDidUpdate event name', () => {
    const listener = vi.fn();
    MagnetometerUncalibrated.addListener(listener);

    expect(FAKE_NATIVE_MAGNETOMETER_UNCALIBRATED.addListener).toHaveBeenCalledWith(
      'magnetometerUncalibratedDidUpdate',
      listener,
    );
  });
});
