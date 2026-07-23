import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_BAROMETER = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExpoBarometer native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-barometer', () => ({
  exponentBarometer: FAKE_NATIVE_BAROMETER,
}));

// device-sensor.ts (imported transitively through ./barometer) pulls Platform/PermissionStatus
// from expo-modules-core, whose real entry drags in the Flow-typed 'react-native' source that
// Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { Barometer } = await import('./barometer');

afterEach(() => {
  Barometer.removeAllListeners();
  vi.clearAllMocks();
});

describe('Barometer', () => {
  it('sets the update interval', () => {
    Barometer.setUpdateInterval(1234);

    expect(FAKE_NATIVE_BAROMETER.setUpdateInterval).toHaveBeenCalledTimes(1);
    expect(FAKE_NATIVE_BAROMETER.setUpdateInterval).toHaveBeenCalledWith(1234);
  });

  it('subscribes through the shared barometerDidUpdate event name', () => {
    const listener = vi.fn();
    Barometer.addListener(listener);

    expect(FAKE_NATIVE_BAROMETER.addListener).toHaveBeenCalledWith('barometerDidUpdate', listener);
  });
});
