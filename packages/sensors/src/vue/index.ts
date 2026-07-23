// @symbiote-native/sensors/vue: the Vue entry over the framework-agnostic core. useAccelerometer
// wires the Accelerometer singleton's addListener lifecycle onto Vue's own onMounted/onUnmounted
// (composables/use-accelerometer) — mirrors the lifecycle-bucket naming convention of
// adapters/vue/src/composables (never `hooks/`, that's React's term).

export { useAccelerometer } from './composables/use-accelerometer';
export type { IAccelerometerMeasurement } from '../core';
export { useBarometer } from './composables/use-barometer';
export type { IBarometerMeasurement } from '../core';
export { useDeviceMotion } from './composables/use-device-motion';
export { DeviceMotionOrientation, gravity, type IDeviceMotionMeasurement } from '../core';
export { useGyroscope } from './composables/use-gyroscope';
export type { IGyroscopeMeasurement } from '../core';
export { useLightSensor } from './composables/use-light-sensor';
export type { ILightSensorMeasurement } from '../core';
export { useMagnetometer } from './composables/use-magnetometer';
export type { IMagnetometerMeasurement } from '../core';
export { useMagnetometerUncalibrated } from './composables/use-magnetometer-uncalibrated';
export type { IMagnetometerUncalibratedMeasurement } from '../core';
export { usePedometer } from './composables/use-pedometer';
export {
  watchStepCount,
  getStepCountAsync,
  isAvailableAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  type IPedometerResult,
  type IPedometerUpdateCallback,
} from '../core';
