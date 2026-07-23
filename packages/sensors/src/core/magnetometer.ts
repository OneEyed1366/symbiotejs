import { DeviceSensor } from './device-sensor';
import { exponentMagnetometer } from './native/exponent-magnetometer';

// Values are the strength of the magnetic field along each axis, measured in microteslas (μT); timestamp is in seconds.
export type IMagnetometerMeasurement = {
  x: number;
  y: number;
  z: number;
  timestamp: number;
};

export class MagnetometerSensor extends DeviceSensor<IMagnetometerMeasurement> {}

const MAGNETOMETER_DID_UPDATE_EVENT_NAME = 'magnetometerDidUpdate';

export const Magnetometer = new MagnetometerSensor(
  exponentMagnetometer,
  MAGNETOMETER_DID_UPDATE_EVENT_NAME,
);
