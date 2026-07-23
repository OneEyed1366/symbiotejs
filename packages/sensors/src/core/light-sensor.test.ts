import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_LIGHT_SENSOR = {
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  listenerCount: vi.fn(() => 0),
  removeAllListeners: vi.fn(),
  setUpdateInterval: vi.fn(),
};

// The real ExpoLightSensor native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of `expo-modules-core`'s runtime resolution.
vi.mock('./native/exponent-light-sensor', () => ({
  exponentLightSensor: FAKE_NATIVE_LIGHT_SENSOR,
}));

// device-sensor.ts (imported transitively through ./light-sensor) pulls Platform/PermissionStatus
// from expo-modules-core, whose real entry drags in the Flow-typed 'react-native' source that
// Vitest's Oxc transform can't parse — same fake as device-sensor.test.ts.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { LightSensor } = await import('./light-sensor');

afterEach(() => {
  LightSensor.removeAllListeners();
  vi.clearAllMocks();
});

describe('LightSensor', () => {
  it('sets the update interval', () => {
    LightSensor.setUpdateInterval(1234);

    expect(FAKE_NATIVE_LIGHT_SENSOR.setUpdateInterval).toHaveBeenCalledTimes(1);
    expect(FAKE_NATIVE_LIGHT_SENSOR.setUpdateInterval).toHaveBeenCalledWith(1234);
  });

  it('subscribes through the shared lightSensorDidUpdate event name', () => {
    const listener = vi.fn();
    LightSensor.addListener(listener);

    expect(FAKE_NATIVE_LIGHT_SENSOR.addListener).toHaveBeenCalledWith(
      'lightSensorDidUpdate',
      listener,
    );
  });
});
