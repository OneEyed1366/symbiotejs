// Pedometer's upstream API (.vendors/expo/packages/expo-sensors/src/Pedometer.ts) is a set of
// free functions, not a class — unlike every other sensor here it has no shared instance to hang
// addListener/removeAllListeners/setUpdateInterval off, so it intentionally does NOT extend
// DeviceSensor (see device-sensor.ts for that shared shape).
import {
  PermissionStatus,
  UnavailabilityError,
  type EventSubscription,
  type PermissionResponse,
} from 'expo-modules-core';
import { exponentPedometer } from './native/exponent-pedometer';

export type IPedometerResult = {
  steps: number;
};

export type IPedometerUpdateCallback = (result: IPedometerResult) => void;

// Upstream event name — the only sensor event in this package carrying a dot, because it is
// Exponent's original (pre-Expo-rename) native module identifier.
const PEDOMETER_UPDATE_EVENT_NAME = 'Exponent.pedometerUpdate';

const DEFAULT_PERMISSION_RESPONSE: PermissionResponse = {
  granted: true,
  expires: 'never',
  canAskAgain: true,
  status: PermissionStatus.GRANTED,
};

export function watchStepCount(callback: IPedometerUpdateCallback): EventSubscription {
  return exponentPedometer.addListener(PEDOMETER_UPDATE_EVENT_NAME, callback);
}

// iOS only in practice (Android has no native getStepCountAsync) — proven by the same
// optional-native-method check upstream uses, not a Platform.OS branch.
export async function getStepCountAsync(start: Date, end: Date): Promise<IPedometerResult> {
  if (!exponentPedometer.getStepCountAsync) {
    throw new UnavailabilityError('ExponentPedometer', 'getStepCountAsync');
  }
  if (start > end) {
    throw new Error('Pedometer: the start date must precede the end date.');
  }
  return exponentPedometer.getStepCountAsync(start.getTime(), end.getTime());
}

export async function isAvailableAsync(): Promise<boolean> {
  return exponentPedometer.isAvailableAsync();
}

export async function getPermissionsAsync(): Promise<PermissionResponse> {
  if (!exponentPedometer.getPermissionsAsync) {
    return DEFAULT_PERMISSION_RESPONSE;
  }
  return exponentPedometer.getPermissionsAsync();
}

export async function requestPermissionsAsync(): Promise<PermissionResponse> {
  if (!exponentPedometer.requestPermissionsAsync) {
    return DEFAULT_PERMISSION_RESPONSE;
  }
  return exponentPedometer.requestPermissionsAsync();
}
