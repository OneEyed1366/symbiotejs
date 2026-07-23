import { requireNativeModule } from 'expo-modules-core';
import type { INativeSensorModule } from '../device-sensor';
import type { IBarometerMeasurement } from '../barometer';

const EXPO_BAROMETER_MODULE_NAME = 'ExpoBarometer';

export const exponentBarometer = requireNativeModule<INativeSensorModule<IBarometerMeasurement>>(
  EXPO_BAROMETER_MODULE_NAME,
);
