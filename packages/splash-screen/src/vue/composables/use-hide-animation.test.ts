// Co-located Vue-driven test (ADR 0025) for useHideAnimation. react-native-bootsplash's
// TurboModule is faked (both its public JS API and the RNBootSplash native constants
// module HideAnimationController/computeHideAnimationStyles reach through), so no real
// native call fires. Proves the composable wires the framework-agnostic core's readiness
// gate + style computation onto Vue's own reactivity: a getter-driven `ready` ref reactively
// re-runs the watchEffect, hide() fires exactly once, and the returned computed reflects the
// core's container/logo/brand shapes faithfully — including the "no logo" skip case.

import { effectScope, nextTick, ref, type EffectScope, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hide } from 'react-native-bootsplash';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import { useHideAnimation } from './use-hide-animation';
import type { IHideAnimationConfig, IManifest } from '../../core';

vi.mock('react-native-bootsplash', () => ({
  hide: vi.fn(() => Promise.resolve()),
  isVisible: vi.fn(() => true),
}));

const FAKE_NATIVE_MODULE = {
  getConstants: vi.fn(() => ({ darkModeEnabled: false })),
  hide: vi.fn(() => Promise.resolve()),
  isVisible: () => true,
};

const registeredNativeModules: Record<string, unknown> = { RNBootSplash: FAKE_NATIVE_MODULE };

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

beforeEach(() => {
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredNativeModules[name];
    return isPresent<T>(module) ? module : null;
  };
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  vi.clearAllMocks();
});

const MANIFEST: IManifest = {
  background: '#ffffff',
  logo: { width: 100, height: 100 },
  brand: { bottom: 40, width: 80, height: 20 },
};

// container.style is IStyleProp<IViewStyle> (union with the falsy/array style-composition
// shapes), but computeHideAnimationStyles always hands back a plain object here — narrow it
// once so the assertions can read .backgroundColor without an `as` cast.
function isPlainViewStyle(style: IStyleProp<IViewStyle>): style is IViewStyle {
  return typeof style === 'object' && style !== null && !Array.isArray(style);
}

function asViewStyle(style: IStyleProp<IViewStyle>): IViewStyle {
  if (!isPlainViewStyle(style)) {
    throw new Error('expected a plain view-style object');
  }
  return style;
}

function runInScope<T>(fn: () => T): { value: T; stop: () => void } {
  const scope: EffectScope = effectScope();
  const value = scope.run(fn);
  if (value === undefined) {
    throw new Error('effectScope.run() returned undefined');
  }
  return { value, stop: () => scope.stop() };
}

describe('useHideAnimation (Vue)', () => {
  it('fires hide exactly once, only after layout + logo load + ready all become true', async () => {
    const readyRef: Ref<boolean> = ref(false);
    const animate = vi.fn();
    const getConfig = (): IHideAnimationConfig => ({
      manifest: MANIFEST,
      logo: 1,
      animate,
      ready: readyRef.value,
    });

    const { value: result, stop } = runInScope(() => useHideAnimation(getConfig));

    expect(hide).not.toHaveBeenCalled();

    result.value.container.onLayout();
    expect(hide, 'layout alone must not hide').not.toHaveBeenCalled();

    expect(typeof result.value.logo.onLoadEnd).toBe('function');
    result.value.logo.onLoadEnd?.();
    expect(hide, 'layout + logo alone must not hide (ready still false)').not.toHaveBeenCalled();

    readyRef.value = true;
    await nextTick();
    expect(hide).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledWith({ fade: false });

    stop();
  });

  it('does not fire hide again once it already fired', async () => {
    const readyRef: Ref<boolean> = ref(true);
    const getConfig = (): IHideAnimationConfig => ({
      manifest: MANIFEST,
      logo: 1,
      animate: vi.fn(),
      ready: readyRef.value,
    });

    const { value: result, stop } = runInScope(() => useHideAnimation(getConfig));

    result.value.container.onLayout();
    result.value.logo.onLoadEnd?.();
    await nextTick();
    expect(hide).toHaveBeenCalledTimes(1);

    // Toggling ready off and back on must not re-run the already-fired animation.
    readyRef.value = false;
    await nextTick();
    readyRef.value = true;
    await nextTick();
    expect(hide).toHaveBeenCalledTimes(1);

    stop();
  });

  it('returns the container/logo/brand shapes for a config with both logo and brand', () => {
    const getConfig = (): IHideAnimationConfig => ({
      manifest: MANIFEST,
      logo: 1,
      brand: 2,
      animate: vi.fn(),
      ready: true,
    });

    const { value: result, stop } = runInScope(() => useHideAnimation(getConfig));
    const { container, logo, brand } = result.value;

    expect(asViewStyle(container.style).backgroundColor).toBe('#ffffff');
    expect(typeof container.onLayout).toBe('function');

    expect(logo.source).toBe(1);
    expect(logo.style).toEqual({ width: 100, height: 100 });
    expect(typeof logo.onLoadEnd).toBe('function');

    expect(brand.source).toBe(2);
    expect(brand.style).toEqual({
      position: 'absolute',
      bottom: 40,
      width: 80,
      height: 20,
    });
    expect(typeof brand.onLoadEnd).toBe('function');

    stop();
  });

  it('skips the logo (source -1, no onLoadEnd) when config.logo is omitted', () => {
    const getConfig = (): IHideAnimationConfig => ({
      manifest: MANIFEST,
      animate: vi.fn(),
      ready: true,
    });

    const { value: result, stop } = runInScope(() => useHideAnimation(getConfig));
    const { logo } = result.value;

    expect(logo.source).toBe(-1);
    expect('onLoadEnd' in logo).toBe(false);

    stop();
  });

  it('reads the native constants exactly once, not on every recompute', () => {
    const readyRef: Ref<boolean> = ref(false);
    const getConfig = (): IHideAnimationConfig => ({
      manifest: MANIFEST,
      logo: 1,
      animate: vi.fn(),
      ready: readyRef.value,
    });

    const { value: result, stop } = runInScope(() => useHideAnimation(getConfig));

    // Force several recomputes of the returned computed.
    void result.value;
    readyRef.value = true;
    void result.value;
    readyRef.value = false;
    void result.value;

    expect(FAKE_NATIVE_MODULE.getConstants).toHaveBeenCalledTimes(1);

    stop();
  });
});
