// The light sensor has no iOS native support (upstream ExpoLightSensor.ios.ts carries the
// same TODO) — this stub always reports unavailable so LightSensorSensor degrades gracefully
// instead of throwing when requireNativeModule() would fail to resolve a real module.
import type { INativeSensorModule } from '../../device-sensor';
import type { ILightSensorMeasurement } from '../../light-sensor';

export const exponentLightSensor: INativeSensorModule<ILightSensorMeasurement> = {
  addListener: () => ({ remove: () => {} }),
  listenerCount: () => 0,
  removeAllListeners: () => {},
  isAvailableAsync: async () => false,
};
