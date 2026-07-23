import { DeviceSensor } from './device-sensor';
import { exponentGyroscope } from './native/exponent-gyroscope';

// Values are rotation rate in radians/second reported along each axis; timestamp is in seconds.
export type IGyroscopeMeasurement = {
  x: number;
  y: number;
  z: number;
  timestamp: number;
};

export class GyroscopeSensor extends DeviceSensor<IGyroscopeMeasurement> {}

const GYROSCOPE_DID_UPDATE_EVENT_NAME = 'gyroscopeDidUpdate';

export const Gyroscope = new GyroscopeSensor(exponentGyroscope, GYROSCOPE_DID_UPDATE_EVENT_NAME);
