import { DeviceSensor } from './device-sensor';
import { exponentDeviceMotion } from './native/exponent-device-motion';

// Acceleration figures are in meters per second squared (m/s^2); rotation is in degrees and
// rotationRate in degrees per second (deg/s); interval is in milliseconds; timestamps are in
// seconds. `acceleration` and `rotationRate` are null on devices that can't isolate gravity
// from raw acceleration.
export type IDeviceMotionMeasurement = {
  acceleration: null | { x: number; y: number; z: number; timestamp: number };
  accelerationIncludingGravity: { x: number; y: number; z: number; timestamp: number };
  rotation: { alpha: number; beta: number; gamma: number; timestamp: number };
  rotationRate: null | { alpha: number; beta: number; gamma: number; timestamp: number };
  interval: number;
  orientation: DeviceMotionOrientation;
};

// Device orientation based on screen rotation.
export enum DeviceMotionOrientation {
  Portrait = 0,
  RightLandscape = 90,
  UpsideDown = 180,
  LeftLandscape = -90,
}

export class DeviceMotionSensor extends DeviceSensor<IDeviceMotionMeasurement> {
  // Standard gravitational acceleration for Earth (m/s^2), read off the native module rather
  // than hardcoded — mirrors upstream's dual exposure as both an instance property and the
  // standalone `gravity` export below.
  readonly gravity: number = exponentDeviceMotion.Gravity;
}

const DEVICE_MOTION_DID_UPDATE_EVENT_NAME = 'deviceMotionDidUpdate';

export const DeviceMotion = new DeviceMotionSensor(
  exponentDeviceMotion,
  DEVICE_MOTION_DID_UPDATE_EVENT_NAME,
);

// Standalone export mirroring the instance property above, for callers that only need the
// constant and not the full sensor singleton.
export const gravity: number = exponentDeviceMotion.Gravity;
