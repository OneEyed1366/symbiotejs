import { requireNativeModule } from 'expo-modules-core';
import type { INativeSensorModule } from '../device-sensor';
import type { IDeviceMotionMeasurement } from '../device-motion';

const EXPONENT_DEVICE_MOTION_MODULE_NAME = 'ExponentDeviceMotion';

// The native module also exposes a `Gravity` numeric constant (standard gravitational
// acceleration, 9.80665 m/s^2) alongside the shared sensor surface.
type IExponentDeviceMotionModule = INativeSensorModule<IDeviceMotionMeasurement> & {
  Gravity: number;
};

export const exponentDeviceMotion = requireNativeModule<IExponentDeviceMotionModule>(
  EXPONENT_DEVICE_MOTION_MODULE_NAME,
);
