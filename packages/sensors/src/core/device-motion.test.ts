import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_GRAVITY = 9.80665;

const FAKE_NATIVE_DEVICE_MOTION = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
  Gravity: FAKE_GRAVITY,
};

// The real ExponentDeviceMotion native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-device-motion', () => ({
  exponentDeviceMotion: FAKE_NATIVE_DEVICE_MOTION,
}));

// device-sensor.ts (imported transitively through ./device-motion) pulls Platform/PermissionStatus
// from expo-modules-core, whose real entry drags in the Flow-typed 'react-native' source that
// Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { DeviceMotion, gravity } = await import('./device-motion');

afterEach(() => {
  DeviceMotion.removeAllListeners();
  vi.clearAllMocks();
});

describe('DeviceMotion', () => {
  it('sets the update interval', () => {
    DeviceMotion.setUpdateInterval(1234);

    expect(FAKE_NATIVE_DEVICE_MOTION.setUpdateInterval).toHaveBeenCalledTimes(1);
    expect(FAKE_NATIVE_DEVICE_MOTION.setUpdateInterval).toHaveBeenCalledWith(1234);
  });

  it('subscribes through the shared deviceMotionDidUpdate event name', () => {
    const listener = vi.fn();
    DeviceMotion.addListener(listener);

    expect(FAKE_NATIVE_DEVICE_MOTION.addListener).toHaveBeenCalledWith(
      'deviceMotionDidUpdate',
      listener,
    );
  });

  it('exposes the native Gravity constant as a standalone export', () => {
    expect(gravity).toBe(FAKE_GRAVITY);
  });

  it('exposes the native Gravity constant as an instance property', () => {
    expect(DeviceMotion.gravity).toBe(FAKE_GRAVITY);
  });
});
