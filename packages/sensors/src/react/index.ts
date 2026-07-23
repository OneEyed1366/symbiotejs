// @symbiote-native/sensors/react: the React entry over the framework-agnostic core.
// useAccelerometer wraps the Accelerometer singleton with React's own lifecycle
// (hooks/use-accelerometer) — mirrors the lifecycle-bucket naming convention of
// adapters/react/src/hooks (never `composables`, that's Vue's term).

export { useAccelerometer } from './hooks/use-accelerometer';
export type { IAccelerometerMeasurement } from '../core';
export { useBarometer } from './hooks/use-barometer';
export type { IBarometerMeasurement } from '../core';
export { useDeviceMotion } from './hooks/use-device-motion';
export { DeviceMotionOrientation, gravity, type IDeviceMotionMeasurement } from '../core';
export { useGyroscope } from './hooks/use-gyroscope';
export type { IGyroscopeMeasurement } from '../core';
export { useLightSensor } from './hooks/use-light-sensor';
export type { ILightSensorMeasurement } from '../core';
export { useMagnetometer } from './hooks/use-magnetometer';
export type { IMagnetometerMeasurement } from '../core';
export { useMagnetometerUncalibrated } from './hooks/use-magnetometer-uncalibrated';
export type { IMagnetometerUncalibratedMeasurement } from '../core';
export { usePedometer } from './hooks/use-pedometer';
export {
  watchStepCount,
  getStepCountAsync,
  isAvailableAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  type IPedometerResult,
  type IPedometerUpdateCallback,
} from '../core';
