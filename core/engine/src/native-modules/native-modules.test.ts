// Co-located unit test for `createDeviceEventModule`, the Pure Fabrication that
// factors out the lazy-resolve + lazy-emitter shape duplicated across
// AccessibilityInfo/AppState/Appearance/BackHandler/Keyboard/Dimensions. A fake
// __turboModuleProxy stands in for the native module; a fake RN$registerCallableModule
// captures the device hub so installDeviceEventHub() doesn't throw.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeviceEventModule } from './index';

interface IDeviceHub {
  emit: (eventType: string, ...args: unknown[]) => void;
}

let deviceHub: IDeviceHub | undefined;

beforeEach(() => {
  deviceHub = undefined;
  globalThis.RN$registerCallableModule = (name: string, factory: () => IDeviceHub): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
  };
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.RN$registerCallableModule = undefined;
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('createDeviceEventModule', () => {
  it('resolves the native module once and caches it across repeated getModule() calls', () => {
    let resolveCount = 0;
    const fakeModule = { addListener: (): void => {}, removeListeners: (): void => {} };
    globalThis.__turboModuleProxy = <T>(name: string): T | null => {
      if (name !== 'FakeModule') return null;
      resolveCount += 1;
      return isPresent<T>(fakeModule) ? fakeModule : null;
    };

    const deviceEventModule = createDeviceEventModule<typeof fakeModule>({
      moduleName: 'FakeModule',
      moduleLogPrefix: 'FakeModule: module',
    });

    expect(deviceEventModule.getModule()).toBe(fakeModule);
    expect(deviceEventModule.getModule()).toBe(fakeModule);
    expect(resolveCount).toBe(1);
  });

  it('a missing module logs and resolves to null, never throwing', () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;

    const deviceEventModule = createDeviceEventModule<{
      addListener(): void;
      removeListeners(): void;
    }>({
      moduleName: 'MissingModule',
      moduleLogPrefix: 'MissingModule: module',
    });

    expect(deviceEventModule.getModule()).toBeNull();
    expect(() => deviceEventModule.getEmitter()).not.toThrow();
  });

  it('constructs the emitter lazily, exactly once, and runs onEmitterCreated exactly once', () => {
    const fakeModule = { addListener: vi.fn(), removeListeners: vi.fn() };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'FakeModule' && isPresent<T>(fakeModule) ? fakeModule : null;

    let createdCount = 0;
    const deviceEventModule = createDeviceEventModule<typeof fakeModule>({
      moduleName: 'FakeModule',
      moduleLogPrefix: 'FakeModule: module',
      onEmitterCreated: () => {
        createdCount += 1;
      },
    });

    const emitterA = deviceEventModule.getEmitter();
    const emitterB = deviceEventModule.getEmitter();
    expect(emitterA).toBe(emitterB);
    expect(createdCount).toBe(1);
  });

  it('binds the module into the emitter by default, pinging its observe-counters', () => {
    const fakeModule = { addListener: vi.fn(), removeListeners: vi.fn() };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'BoundModule' && isPresent<T>(fakeModule) ? fakeModule : null;

    const deviceEventModule = createDeviceEventModule<typeof fakeModule>({
      moduleName: 'BoundModule',
      moduleLogPrefix: 'BoundModule: module',
    });

    const sub = deviceEventModule.getEmitter().addListener('someEvent', () => {});
    expect(fakeModule.addListener).toHaveBeenCalledWith('someEvent');
    sub.remove();
    expect(fakeModule.removeListeners).toHaveBeenCalledWith(1);
  });

  it('bindModuleToEmitter: false never pings the module counters, even though the module resolved', () => {
    const fakeModule = { addListener: vi.fn(), removeListeners: vi.fn() };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'UnboundModule' && isPresent<T>(fakeModule) ? fakeModule : null;

    const deviceEventModule = createDeviceEventModule<typeof fakeModule>({
      moduleName: 'UnboundModule',
      moduleLogPrefix: 'UnboundModule: module',
      bindModuleToEmitter: false,
    });

    deviceEventModule.getEmitter().addListener('someEvent', () => {});
    expect(fakeModule.addListener).not.toHaveBeenCalled();
  });

  it('onEmitterCreated receives the SAME emitter and module getEmitter()/getModule() hand back', () => {
    const fakeModule = { addListener: (): void => {}, removeListeners: (): void => {} };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'HookModule' && isPresent<T>(fakeModule) ? fakeModule : null;

    let receivedModule: typeof fakeModule | null | undefined;
    let receivedEmitter: unknown;
    const deviceEventModule = createDeviceEventModule<typeof fakeModule>({
      moduleName: 'HookModule',
      moduleLogPrefix: 'HookModule: module',
      onEmitterCreated: (emitter, module) => {
        receivedEmitter = emitter;
        receivedModule = module;
      },
    });

    const emitter = deviceEventModule.getEmitter();
    expect(receivedEmitter).toBe(emitter);
    expect(receivedModule).toBe(fakeModule);
    expect(deviceEventModule.getModule()).toBe(fakeModule);
  });
});
