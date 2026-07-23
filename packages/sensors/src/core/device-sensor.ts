// expo-sensors' own DeviceSensor imports PermissionResponse/PermissionExpiration/PermissionStatus
// from the `expo` meta-package. We never depend on `expo` itself (it drags in a second
// Metro/babel pipeline — see the symbiote-expo-native-module skill) so this pulls the same
// three exports straight from expo-modules-core, which is where `expo` re-exports them from.
import {
  Platform,
  PermissionStatus,
  type EventSubscription,
  type PermissionExpiration,
  type PermissionResponse,
} from 'expo-modules-core';

export type IListener<Measurement> = (measurement: Measurement) => void;

export type INativeSensorModule<Measurement> = {
  addListener(eventName: string, listener: IListener<Measurement>): EventSubscription;
  listenerCount(eventName: string): number;
  removeAllListeners(eventName: string): void;
  setUpdateInterval?(intervalMs: number): void;
  isAvailableAsync?(): Promise<boolean>;
  getPermissionsAsync?(): Promise<PermissionResponse>;
  requestPermissionsAsync?(): Promise<PermissionResponse>;
};

const DEFAULT_PERMISSION_RESPONSE: PermissionResponse = {
  granted: true,
  expires: 'never',
  canAskAgain: true,
  status: PermissionStatus.GRANTED,
};

export class DeviceSensor<Measurement> {
  readonly nativeModule: INativeSensorModule<Measurement>;
  readonly nativeEventName: string;

  constructor(nativeModule: INativeSensorModule<Measurement>, nativeEventName: string) {
    this.nativeModule = nativeModule;
    this.nativeEventName = nativeEventName;
  }

  addListener(listener: IListener<Measurement>): EventSubscription {
    return this.nativeModule.addListener(this.nativeEventName, listener);
  }

  hasListeners(): boolean {
    return this.getListenerCount() > 0;
  }

  getListenerCount(): number {
    return this.nativeModule.listenerCount(this.nativeEventName);
  }

  removeAllListeners(): void {
    this.nativeModule.removeAllListeners(this.nativeEventName);
  }

  // upstream keeps this only for callers still holding a pre-subscription-object reference.
  removeSubscription(subscription: EventSubscription): void {
    subscription.remove();
  }

  setUpdateInterval(intervalMs: number): void {
    if (!this.nativeModule.setUpdateInterval) {
      console.warn(
        `@symbiote-native/sensors: setUpdateInterval() is not supported on ${Platform.OS}`,
      );
      return;
    }
    this.nativeModule.setUpdateInterval(intervalMs);
  }

  async isAvailableAsync(): Promise<boolean> {
    if (!this.nativeModule.isAvailableAsync) {
      return false;
    }
    return this.nativeModule.isAvailableAsync();
  }

  async getPermissionsAsync(): Promise<PermissionResponse> {
    if (!this.nativeModule.getPermissionsAsync) {
      return DEFAULT_PERMISSION_RESPONSE;
    }
    return this.nativeModule.getPermissionsAsync();
  }

  async requestPermissionsAsync(): Promise<PermissionResponse> {
    if (!this.nativeModule.requestPermissionsAsync) {
      return DEFAULT_PERMISSION_RESPONSE;
    }
    return this.nativeModule.requestPermissionsAsync();
  }
}

export { PermissionStatus };
export type { EventSubscription, PermissionExpiration, PermissionResponse };
