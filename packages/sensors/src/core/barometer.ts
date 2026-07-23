import { DeviceSensor } from './device-sensor';
import { exponentBarometer } from './native/exponent-barometer';

// Pressure is in hectopascals (hPa); relativeAltitude (meters) is iOS-only; timestamp is in seconds.
export type IBarometerMeasurement = {
  pressure: number;
  relativeAltitude?: number;
  timestamp: number;
};

export class BarometerSensor extends DeviceSensor<IBarometerMeasurement> {}

const BAROMETER_DID_UPDATE_EVENT_NAME = 'barometerDidUpdate';

export const Barometer = new BarometerSensor(exponentBarometer, BAROMETER_DID_UPDATE_EVENT_NAME);
