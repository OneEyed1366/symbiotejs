// AccelerometerService is the Angular-only lifecycle half; the sensor singleton and event
// subscription plumbing all live in core, shared with React/Vue.
export { AccelerometerService } from './services/accelerometer.service';
export type { IAccelerometerMeasurement } from '../core';
export { BarometerService } from './services/barometer.service';
export type { IBarometerMeasurement } from '../core';
export { DeviceMotionService } from './services/device-motion.service';
export { DeviceMotionOrientation, gravity, type IDeviceMotionMeasurement } from '../core';
export { GyroscopeService } from './services/gyroscope.service';
export type { IGyroscopeMeasurement } from '../core';
export { LightSensorService } from './services/light-sensor.service';
export type { ILightSensorMeasurement } from '../core';
export { MagnetometerService } from './services/magnetometer.service';
export type { IMagnetometerMeasurement } from '../core';
export { MagnetometerUncalibratedService } from './services/magnetometer-uncalibrated.service';
export type { IMagnetometerUncalibratedMeasurement } from '../core';
export { PedometerService } from './services/pedometer.service';
export {
  watchStepCount,
  getStepCountAsync,
  isAvailableAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  type IPedometerResult,
  type IPedometerUpdateCallback,
} from '../core';
