import { requireNativeModule } from 'expo-modules-core';
import type { INativeSensorModule } from '../device-sensor';
import type { IAccelerometerMeasurement } from '../accelerometer';

const EXPONENT_ACCELEROMETER_MODULE_NAME = 'ExponentAccelerometer';

export const exponentAccelerometer = requireNativeModule<
  INativeSensorModule<IAccelerometerMeasurement>
>(EXPONENT_ACCELEROMETER_MODULE_NAME);
