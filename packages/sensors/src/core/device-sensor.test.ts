import { describe, expect, it, vi } from 'vitest';
import type { INativeSensorModule } from './device-sensor';

// expo-modules-core's real entry transitively imports the 'react-native' package for
// Platform/TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform cannot parse
// (Metro strips Flow on-device, Vitest has no such pipeline) — faked here the same way
// react-native-bootsplash is faked in the splash-screen package's own composable tests.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

const { DeviceSensor } = await import('./device-sensor');

// DeviceSensor only ever calls addListener/listenerCount/removeAllListeners on its native
// module — a plain fake satisfying INativeSensorModule is enough, no need to extend
// expo-modules-core's real NativeModule (which requires a live native JSI runtime to construct).
function createFakeNativeModule(): INativeSensorModule<unknown> {
  const listeners = new Set<(measurement: unknown) => void>();
  return {
    addListener: vi.fn((_eventName: string, listener: (measurement: unknown) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    }),
    listenerCount: vi.fn(() => listeners.size),
    removeAllListeners: vi.fn(() => listeners.clear()),
    setUpdateInterval: vi.fn(),
  };
}

describe('DeviceSensor', () => {
  it('counts the number of listeners', () => {
    const nativeModule = createFakeNativeModule();
    const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

    const subscription1 = sensor.addListener(() => {});
    expect(sensor.hasListeners()).toBe(true);
    expect(sensor.getListenerCount()).toBe(1);

    const subscription2 = sensor.addListener(() => {});
    sensor.addListener(() => {});
    expect(sensor.getListenerCount()).toBe(3);

    subscription2.remove();
    expect(sensor.getListenerCount()).toBe(2);

    sensor.removeSubscription(subscription1);
    expect(sensor.getListenerCount()).toBe(1);

    sensor.removeAllListeners();
    expect(sensor.getListenerCount()).toBe(0);
  });

  it('forwards setUpdateInterval to the native module', () => {
    const nativeModule = createFakeNativeModule();
    const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

    sensor.setUpdateInterval(1234);

    expect(nativeModule.setUpdateInterval).toHaveBeenCalledTimes(1);
    expect(nativeModule.setUpdateInterval).toHaveBeenCalledWith(1234);
  });

  it('falls back to a granted default permission response when the native module has none', async () => {
    const nativeModule = createFakeNativeModule();
    const sensor = new DeviceSensor(nativeModule, 'mockDidUpdate');

    await expect(sensor.getPermissionsAsync()).resolves.toEqual({
      granted: true,
      expires: 'never',
      canAskAgain: true,
      status: 'granted',
    });
    await expect(sensor.isAvailableAsync()).resolves.toBe(false);
  });
});
