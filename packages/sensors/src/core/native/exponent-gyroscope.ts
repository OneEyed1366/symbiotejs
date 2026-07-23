import { requireNativeModule } from 'expo-modules-core';
import type { INativeSensorModule } from '../device-sensor';
import type { IGyroscopeMeasurement } from '../gyroscope';

const EXPONENT_GYROSCOPE_MODULE_NAME = 'ExponentGyroscope';

export const exponentGyroscope = requireNativeModule<INativeSensorModule<IGyroscopeMeasurement>>(
  EXPONENT_GYROSCOPE_MODULE_NAME,
);
