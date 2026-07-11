// Co-located unit test for the LayoutAnimation module: JS surface plus that
// configureNext ships its config to the native UIManager. A fake native module (installed via
// __turboModuleProxy) records configureNextLayoutAnimation calls.
//
// IMPORTANT: this only proves the JS surface and the dispatch. Whether the chosen native
// module NAME is the real one on a given platform is verified on-device, never headless (a
// headless fake answers to any name).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import type { ILayoutAnimationConfig } from './index';

// The single correct TurboModule name. Kept in sync with index.ts's
// NATIVE_UI_MANAGER_MODULE_NAME.
const NATIVE_MODULE_NAME = 'UIManager';

interface ICapturedCall {
  config: ILayoutAnimationConfig;
  onSuccess: () => void;
  onError: () => void;
}

let LayoutAnimation: typeof import('./index').LayoutAnimation;

let captured: ICapturedCall | null;

beforeEach(async () => {
  captured = null;

  const fakeUIManager = {
    configureNextLayoutAnimation(
      config: ILayoutAnimationConfig,
      onSuccess: () => void,
      onError: () => void,
    ): void {
      captured = { config, onSuccess, onError };
    },
  };

  globalThis.__turboModuleProxy = <T>(name: string): T | null =>
    name === NATIVE_MODULE_NAME && isPresent<T>(fakeUIManager) ? fakeUIManager : null;

  vi.resetModules();
  ({ LayoutAnimation } = await import('./index'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  globalThis.nativeFabricUIManager = undefined;
  vi.useRealTimers();
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('LayoutAnimation JS surface', () => {
  it('Presets.easeInEaseOut has the expected shape', () => {
    const preset = LayoutAnimation.Presets.easeInEaseOut;
    expect(preset.duration).toBe(300);
    expect(preset.create?.type).toBe('easeInEaseOut');
    expect(preset.create?.property).toBe('opacity');
    expect(preset.update?.type).toBe('easeInEaseOut');
    expect(preset.delete?.type).toBe('easeInEaseOut');
    expect(preset.delete?.property).toBe('opacity');
  });

  it('create(...) builds a well-formed config (update carries only type)', () => {
    const built = LayoutAnimation.create(
      300,
      LayoutAnimation.Types.linear,
      LayoutAnimation.Properties.scaleXY,
    );
    expect(built.duration).toBe(300);
    expect(built.create?.type).toBe('linear');
    expect(built.create?.property).toBe('scaleXY');
    expect(built.update?.type).toBe('linear');
    expect(built.update?.property).toBeUndefined();
    expect(built.delete?.type).toBe('linear');
    expect(built.delete?.property).toBe('scaleXY');
  });
});

describe('LayoutAnimation.coerceType', () => {
  it('resolves a known easing string to its matching type', () => {
    expect(LayoutAnimation.coerceType('linear')).toBe('linear');
    expect(LayoutAnimation.coerceType('spring')).toBe('spring');
  });

  it("falls back to 'keyboard' for an easing string that isn't a known type", () => {
    expect(LayoutAnimation.coerceType('easeOutCubic')).toBe('keyboard');
    expect(LayoutAnimation.coerceType('')).toBe('keyboard');
  });
});

describe('LayoutAnimation.configureNext dispatch', () => {
  it('dispatches the config to native and drives onAnimationDidEnd ONLY from native success', () => {
    vi.useFakeTimers();
    const preset = LayoutAnimation.Presets.easeInEaseOut;

    let didEndCount = 0;
    LayoutAnimation.configureNext(preset, () => {
      didEndCount += 1;
    });

    expect(captured).not.toBeNull();
    expect(captured?.config).toBe(preset);

    // Regression guard: onAnimationDidEnd must NOT fire on a JS timer. Advance well past
    // the old `duration + slack` race window without invoking native.
    vi.advanceTimersByTime((preset.duration ?? 0) + 100);
    expect(didEndCount).toBe(0);

    // Native invokes its success callback. THAT drives onAnimationDidEnd, exactly once.
    captured?.onSuccess();
    expect(didEndCount).toBe(1);

    // No double-fire: a repeat success or a late error is swallowed by the idempotent guard.
    captured?.onSuccess();
    captured?.onError();
    expect(didEndCount).toBe(1);
  });
});

describe('LayoutAnimation native resolution mechanism', () => {
  it('prefers the Fabric global slot when it exposes configureNextLayoutAnimation', () => {
    installFabric();
    const slot: unknown = Reflect.get(globalThis, 'nativeFabricUIManager');
    if (typeof slot !== 'object' || slot === null) {
      throw new Error('installFabric did not install a slot');
    }
    let fabricCalls = 0;
    Object.assign(slot, {
      configureNextLayoutAnimation(
        _config: ILayoutAnimationConfig,
        onSuccess: () => void,
        _onError: () => void,
      ): void {
        fabricCalls += 1;
        onSuccess();
      },
    });

    let didEndCount = 0;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear, () => {
      didEndCount += 1;
    });

    expect(fabricCalls).toBe(1);
    expect(didEndCount).toBe(1);
    // The TurboModule fallback (registered under NATIVE_MODULE_NAME in beforeEach)
    // must NOT have been consulted once the Fabric global slot handled it.
    expect(captured).toBeNull();
  });

  it('falls back to the "UIManager" TurboModule when the Fabric global slot is absent', () => {
    expect(globalThis.nativeFabricUIManager).toBeUndefined();

    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear);

    expect(captured).not.toBeNull();
  });

  it('does not resolve a module registered only under the phantom "FabricUIManager" name', () => {
    const fakeUIManagerUnderWrongName = {
      configureNextLayoutAnimation(
        config: ILayoutAnimationConfig,
        onSuccess: () => void,
        onError: () => void,
      ): void {
        captured = { config, onSuccess, onError };
      },
    };
    globalThis.__turboModuleProxy = <T>(name: string): T | null =>
      name === 'FabricUIManager' && isPresent<T>(fakeUIManagerUnderWrongName)
        ? fakeUIManagerUnderWrongName
        : null;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear);

    expect(captured).toBeNull();
  });
});

describe('LayoutAnimation (no native module)', () => {
  it('configureNext is a safe no-op and never calls native', async () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    vi.resetModules();
    const fresh = await import('./index');

    captured = null;
    expect(() => {
      fresh.LayoutAnimation.configureNext(fresh.LayoutAnimation.Presets.easeInEaseOut);
    }).not.toThrow();
    expect(captured).toBeNull();
  });
});
