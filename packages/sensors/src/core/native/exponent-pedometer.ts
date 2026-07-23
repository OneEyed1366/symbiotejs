import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription, PermissionResponse } from 'expo-modules-core';
import type { IPedometerResult } from '../pedometer';

const EXPONENT_PEDOMETER_MODULE_NAME = 'ExponentPedometer';

export type IExponentPedometerModule = {
  addListener(eventName: string, listener: (result: IPedometerResult) => void): EventSubscription;
  getStepCountAsync?(startMs: number, endMs: number): Promise<IPedometerResult>;
  isAvailableAsync(): Promise<boolean>;
  getPermissionsAsync?(): Promise<PermissionResponse>;
  requestPermissionsAsync?(): Promise<PermissionResponse>;
};

export const exponentPedometer = requireNativeModule<IExponentPedometerModule>(
  EXPONENT_PEDOMETER_MODULE_NAME,
);
