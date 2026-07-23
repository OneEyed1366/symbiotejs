import { requireNativeModule } from 'expo-modules-core';
import type { INativeSensorModule } from '../device-sensor';
import type { IMagnetometerUncalibratedMeasurement } from '../magnetometer-uncalibrated';

const EXPONENT_MAGNETOMETER_UNCALIBRATED_MODULE_NAME = 'ExponentMagnetometerUncalibrated';

export const exponentMagnetometerUncalibrated = requireNativeModule<
  INativeSensorModule<IMagnetometerUncalibratedMeasurement>
>(EXPONENT_MAGNETOMETER_UNCALIBRATED_MODULE_NAME);
