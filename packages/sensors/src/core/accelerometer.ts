import { DeviceSensor } from './device-sensor';
import { exponentAccelerometer } from './native/exponent-accelerometer';

// Values are g-force (a `g` = 9.81 m/s^2) reported along each axis; timestamp is in seconds.
export type IAccelerometerMeasurement = {
  x: number;
  y: number;
  z: number;
  timestamp: number;
};

export class AccelerometerSensor extends DeviceSensor<IAccelerometerMeasurement> {}

const ACCELEROMETER_DID_UPDATE_EVENT_NAME = 'accelerometerDidUpdate';

export const Accelerometer = new AccelerometerSensor(
  exponentAccelerometer,
  ACCELEROMETER_DID_UPDATE_EVENT_NAME,
);
