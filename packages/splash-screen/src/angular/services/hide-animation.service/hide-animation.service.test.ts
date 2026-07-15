// Co-located Angular-driven test (ADR 0025) for HideAnimationService. Mounts a real host
// component through @symbiote-native/angular so `connect()` runs the same way an app would call
// it — inside the component's own injection context — and drives the returned signal through a
// full mount/unmount lifecycle rather than poking the service in isolation.

import '@angular/compiler';
import { Component, inject, signal, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { flattenStyle } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';
import type { IImageSourceProp } from '@symbiote-native/components';
import { hide as mockedHide } from 'react-native-bootsplash';
import type { IHideAnimationResult } from '../../../core';
import { HideAnimationService } from './index';

vi.mock('react-native-bootsplash', () => ({
  hide: vi.fn(() => Promise.resolve()),
  isVisible: vi.fn(() => true),
}));

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

const FAKE_NATIVE_MODULE = {
  getConstants: () => ({ darkModeEnabled: false }),
  hide: vi.fn(() => Promise.resolve()),
  isVisible: () => true,
};

const registeredNativeModules: Record<string, unknown> = { RNBootSplash: FAKE_NATIVE_MODULE };

const ROOT_TAG = 940;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
};

const MANIFEST = {
  background: '#ffffff',
  logo: { width: 100, height: 100 },
  brand: { bottom: 40, width: 80, height: 20 },
};

const LOGO_SOURCE: IImageSourceProp = { uri: 'logo.png' };
const BRAND_SOURCE: IImageSourceProp = { uri: 'brand.png' };

let capturedResult: Signal<IHideAnimationResult> | undefined;
let capturedAnimate: ReturnType<typeof vi.fn> | undefined;
let capturedReady: ReturnType<typeof signal<boolean>> | undefined;

@Component({
  selector: 'symbiote-hide-animation-host',
  standalone: true,
  template: '',
})
class HideAnimationHost {
  readonly ready = signal(true);
  readonly animate = vi.fn();

  readonly hideAnimation = inject(HideAnimationService).connect(() => ({
    manifest: MANIFEST,
    ready: this.ready(),
    logo: LOGO_SOURCE,
    brand: BRAND_SOURCE,
    animate: this.animate,
  }));

  constructor() {
    capturedResult = this.hideAnimation;
    capturedAnimate = this.animate;
    capturedReady = this.ready;
  }
}

@Component({
  selector: 'symbiote-hide-animation-no-logo-host',
  standalone: true,
  template: '',
})
class HideAnimationNoLogoHost {
  readonly animate = vi.fn();

  readonly hideAnimation = inject(HideAnimationService).connect(() => ({
    manifest: MANIFEST,
    logo: undefined,
    brand: undefined,
    animate: this.animate,
  }));

  constructor() {
    capturedResult = this.hideAnimation;
    capturedAnimate = this.animate;
  }
}

beforeEach(() => {
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredNativeModules[name];
    return isPresent<T>(module) ? module : null;
  };
  capturedResult = undefined;
  capturedAnimate = undefined;
  capturedReady = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  globalThis.__turboModuleProxy = undefined;
  vi.clearAllMocks();
});

describe('HideAnimationService.connect', () => {
  it('reports the container/logo/brand shapes for a config with both logo and brand', async () => {
    mount(ROOT_TAG, HideAnimationHost);
    await settle();

    const result = capturedResult?.();
    if (result === undefined) throw new Error('hideAnimation signal was not captured');

    expect(flattenStyle(result.container.style).backgroundColor).toBe(MANIFEST.background);
    expect(result.container.onLayout).toBeTypeOf('function');

    expect(result.logo.source).toBe(LOGO_SOURCE);
    expect(flattenStyle(result.logo.style)).toEqual({
      width: MANIFEST.logo.width,
      height: MANIFEST.logo.height,
    });
    expect(result.logo.onLoadEnd).toBeTypeOf('function');

    expect(result.brand.source).toBe(BRAND_SOURCE);
    expect(flattenStyle(result.brand.style)).toMatchObject({
      bottom: MANIFEST.brand.bottom,
      width: MANIFEST.brand.width,
      height: MANIFEST.brand.height,
    });
    expect(result.brand.onLoadEnd).toBeTypeOf('function');
  });

  it('fires hide() exactly once, only after layout + logo + brand + ready are all satisfied', async () => {
    mount(ROOT_TAG, HideAnimationHost);
    await settle();

    const result = capturedResult;
    if (result === undefined || capturedAnimate === undefined) {
      throw new Error('hideAnimation signal was not captured');
    }

    result().container.onLayout();
    expect(mockedHide).not.toHaveBeenCalled();

    result().logo.onLoadEnd?.();
    expect(mockedHide).not.toHaveBeenCalled();

    // Brand is the last gate: only once it reports load-end does hide() fire.
    result().brand.onLoadEnd?.();
    await settle();

    expect(mockedHide).toHaveBeenCalledOnce();
    expect(mockedHide).toHaveBeenCalledWith({ fade: false });
    expect(capturedAnimate).toHaveBeenCalledOnce();
  });

  it('does not fire hide() again after it has already fired', async () => {
    mount(ROOT_TAG, HideAnimationHost);
    await settle();

    const result = capturedResult;
    if (result === undefined || capturedReady === undefined) {
      throw new Error('hideAnimation signal was not captured');
    }

    result().container.onLayout();
    result().logo.onLoadEnd?.();
    result().brand.onLoadEnd?.();
    await settle();
    expect(mockedHide).toHaveBeenCalledOnce();

    // A later config change (ready flips off then back on) re-runs the effect's updateConfig,
    // but the controller's own animateHasBeenCalled guard keeps hide() from firing twice.
    capturedReady.set(false);
    await settle();
    capturedReady.set(true);
    await settle();

    expect(mockedHide).toHaveBeenCalledOnce();
  });

  it('reports source -1 and no onLoadEnd when config.logo is omitted', async () => {
    mount(ROOT_TAG, HideAnimationNoLogoHost);
    await settle();

    const result = capturedResult?.();
    if (result === undefined) throw new Error('hideAnimation signal was not captured');

    expect(result.logo.source).toBe(-1);
    expect(result.logo.onLoadEnd).toBeUndefined();
    expect(result.brand.source).toBe(-1);
    expect(result.brand.onLoadEnd).toBeUndefined();
  });
});
