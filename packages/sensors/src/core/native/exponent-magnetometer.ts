import { requireNativeModule } from 'expo-modules-core';
import type { INativeSensorModule } from '../device-sensor';
import type { IMagnetometerMeasurement } from '../magnetometer';

const EXPONENT_MAGNETOMETER_MODULE_NAME = 'ExponentMagnetometer';

export const exponentMagnetometer = requireNativeModule<
  INativeSensorModule<IMagnetometerMeasurement>
>(EXPONENT_MAGNETOMETER_MODULE_NAME);
