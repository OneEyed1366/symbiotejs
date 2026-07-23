import { requireNativeModule } from 'expo-modules-core';
import type { INativeSensorModule } from '../../device-sensor';
import type { ILightSensorMeasurement } from '../../light-sensor';

const EXPONENT_LIGHT_SENSOR_MODULE_NAME = 'ExpoLightSensor';

export const exponentLightSensor = requireNativeModule<
  INativeSensorModule<ILightSensorMeasurement>
>(EXPONENT_LIGHT_SENSOR_MODULE_NAME);
