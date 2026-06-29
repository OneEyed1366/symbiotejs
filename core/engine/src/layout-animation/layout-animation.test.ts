// Co-located unit test (ADR 0025) for the LayoutAnimation module: JS surface plus that
// configureNext ships its config to the native UIManager. A fake native module (installed via
// __turboModuleProxy) records configureNextLayoutAnimation calls.
//
// IMPORTANT: this only proves the JS surface and the dispatch. Whether the chosen native
// module NAME is the real one on a given platform is verified on-device, never headless (a
// headless fake answers to any name). See .docs/native-module-platform-routing.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ILayoutAnimationConfig } from './index';

// The module name the impl resolves first. Kept in sync with layout-animation.ts's
// NATIVE_UI_MANAGER_NAME.primary (DEVICE-VERIFY-PENDING on a real host).
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
