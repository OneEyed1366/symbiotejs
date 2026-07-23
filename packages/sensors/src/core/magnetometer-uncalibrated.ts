import { DeviceSensor } from './device-sensor';
import { exponentMagnetometerUncalibrated } from './native/exponent-magnetometer-uncalibrated';

// Values are the uncalibrated strength of the magnetic field along each axis, in microteslas
// (`μT`); timestamp is in seconds.
export type IMagnetometerUncalibratedMeasurement = {
  x: number;
  y: number;
  z: number;
  timestamp: number;
};

export class MagnetometerUncalibratedSensor extends DeviceSensor<IMagnetometerUncalibratedMeasurement> {}

const MAGNETOMETER_UNCALIBRATED_DID_UPDATE_EVENT_NAME = 'magnetometerUncalibratedDidUpdate';

export const MagnetometerUncalibrated = new MagnetometerUncalibratedSensor(
  exponentMagnetometerUncalibrated,
  MAGNETOMETER_UNCALIBRATED_DID_UPDATE_EVENT_NAME,
);
