// Co-located React-driven test (ADR 0025) for useHideAnimation. Mocks react-native-bootsplash's
// hide()/isVisible() (imported straight from the npm package by core/hide.ts) and installs a
// fake __turboModuleProxy so getHideAnimationConstants() resolves without a real native host.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useHideAnimation } from './index';
import type { IHideAnimationConfig, IHideAnimationResult, IManifest } from '../../../core';

vi.mock('react-native-bootsplash', () => ({
  hide: vi.fn(() => Promise.resolve()),
  isVisible: vi.fn(() => true),
}));

const ROOT_TAG = 900;

const FAKE_NATIVE_MODULE = { getConstants: () => ({ darkModeEnabled: false }) };

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T,>(name: string): T | null =>
    name === 'RNBootSplash' && isPresent<T>(FAKE_NATIVE_MODULE) ? FAKE_NATIVE_MODULE : null,
});

const MANIFEST: IManifest = { background: '#fff', logo: { width: 100, height: 100 } };

const results: IHideAnimationResult[] = [];

function Probe(props: { config: IHideAnimationConfig }): ReactElement {
  results.push(useHideAnimation(props.config));
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

describe('useHideAnimation', () => {
  it('reports the skip sentinel and no onLoadEnd when logo is omitted', () => {
    mount(ROOT_TAG, createElement(Probe, { config: { manifest: MANIFEST, animate: () => {} } }));

    const last = results[results.length - 1];
    expect(last.logo.source).toBe(-1);
    expect(last.logo.onLoadEnd).toBeUndefined();
  });

  it('returns the full logo/brand shape when both are provided', () => {
    const config: IHideAnimationConfig = {
      manifest: { ...MANIFEST, brand: { bottom: 20, width: 60, height: 20 } },
      logo: 123,
      brand: 456,
      animate: () => {},
    };

    mount(ROOT_TAG, createElement(Probe, { config }));

    const last = results[results.length - 1];
    expect(last.logo.source).toBe(123);
    expect(last.logo.resizeMode).toBe('contain');
    expect(last.brand.source).toBe(456);
    expect(last.brand.resizeMode).toBe('contain');
  });

  it('hides exactly once, only after layout + logo load-end both resolve', async () => {
    const { hide } = await import('react-native-bootsplash');
    let animateCalls = 0;
    const config: IHideAnimationConfig = {
      manifest: MANIFEST,
      logo: 1,
      ready: true,
      animate: () => {
        animateCalls += 1;
      },
    };

    mount(ROOT_TAG, createElement(Probe, { config }));
    const result = results[results.length - 1];

    expect(hide).not.toHaveBeenCalled();
    result.container.onLayout();
    expect(hide).not.toHaveBeenCalled();

    result.logo.onLoadEnd?.();

    expect(hide).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledWith({ fade: false });
    await vi.waitFor(() => expect(animateCalls).toBe(1));
  });

  it('does not hide again once already triggered', async () => {
    const { hide } = await import('react-native-bootsplash');
    const config: IHideAnimationConfig = { manifest: MANIFEST, ready: true, animate: () => {} };

    mount(ROOT_TAG, createElement(Probe, { config }));
    const result = results[results.length - 1];

    result.container.onLayout();
    await vi.waitFor(() => expect(hide).toHaveBeenCalledTimes(1));

    result.container.onLayout();
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
