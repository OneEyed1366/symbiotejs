import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_GYROSCOPE = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExponentGyroscope native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-gyroscope', () => ({
  exponentGyroscope: FAKE_NATIVE_GYROSCOPE,
}));

// device-sensor.ts (imported transitively through ./gyroscope) pulls Platform/PermissionStatus
// from expo-modules-core, whose real entry drags in the Flow-typed 'react-native' source that
// Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { Gyroscope } = await import('./gyroscope');

afterEach(() => {
  Gyroscope.removeAllListeners();
  vi.clearAllMocks();
});

describe('Gyroscope', () => {
  it('sets the update interval', () => {
    Gyroscope.setUpdateInterval(1234);

    expect(FAKE_NATIVE_GYROSCOPE.setUpdateInterval).toHaveBeenCalledTimes(1);
    expect(FAKE_NATIVE_GYROSCOPE.setUpdateInterval).toHaveBeenCalledWith(1234);
  });

  it('subscribes through the shared gyroscopeDidUpdate event name', () => {
    const listener = vi.fn();
    Gyroscope.addListener(listener);

    expect(FAKE_NATIVE_GYROSCOPE.addListener).toHaveBeenCalledWith('gyroscopeDidUpdate', listener);
  });
});
