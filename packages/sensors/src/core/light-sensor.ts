import { DeviceSensor } from './device-sensor';
import { exponentLightSensor } from './native/exponent-light-sensor';

// Ambient light level in lux (lx); timestamp is in seconds. Android-only — see
// core/native/exponent-light-sensor/index.ios.ts for the iOS stub.
export type ILightSensorMeasurement = {
  illuminance: number;
  timestamp: number;
};

export class LightSensorSensor extends DeviceSensor<ILightSensorMeasurement> {}

const LIGHT_SENSOR_DID_UPDATE_EVENT_NAME = 'lightSensorDidUpdate';

export const LightSensor = new LightSensorSensor(
  exponentLightSensor,
  LIGHT_SENSOR_DID_UPDATE_EVENT_NAME,
);
