// Co-located React-driven test (ADR 0025) for useMagnetometerUncalibrated. Mocks the whole
// `core` module rather than expo-modules-core internals — this hook's own lifecycle wiring
// (subscribe/unsubscribe/interval) is what's under test, not the core port itself, which
// already has its own coverage in packages/sensors/src/core/*.test.ts.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useMagnetometerUncalibrated } from './index';
import type { IMagnetometerUncalibratedMeasurement } from '../../../core';

const { addListener, removeAllListeners, setUpdateInterval, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addListener: vi.fn(
      (_listener: (measurement: IMagnetometerUncalibratedMeasurement) => void) => ({
        remove,
      }),
    ),
    removeAllListeners: vi.fn(),
    setUpdateInterval: vi.fn(),
    remove,
  };
});

vi.mock('../../../core', () => ({
  MagnetometerUncalibrated: { addListener, removeAllListeners, setUpdateInterval },
}));

const ROOT_TAG = 902;

const results: Array<IMagnetometerUncalibratedMeasurement | null> = [];

function Probe(props: { updateIntervalMs?: number }): ReactElement {
  results.push(useMagnetometerUncalibrated(props.updateIntervalMs));
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

describe('useMagnetometerUncalibrated', () => {
  it('reports null before any native measurement arrives', () => {
    mount(ROOT_TAG, createElement(Probe, {}));

    expect(results[results.length - 1]).toBeNull();
  });

  it('updates to the latest measurement once the native listener fires', async () => {
    mount(ROOT_TAG, createElement(Probe, {}));

    const measurement: IMagnetometerUncalibratedMeasurement = {
      x: 0.1,
      y: 0.2,
      z: 0.3,
      timestamp: 123,
    };
    const listener = addListener.mock.calls[0][0];
    listener(measurement);

    // The mock invokes the listener directly, outside the engine's event dispatcher
    // (setEventDispatcher in render.ts), which is what normally flushes a native-driven
    // setState synchronously — so the resulting re-render lands on a later microtask here.
    await vi.waitFor(() => expect(results[results.length - 1]).toEqual(measurement));
  });

  it('unsubscribes from the native listener on unmount', () => {
    mount(ROOT_TAG, createElement(Probe, {}));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('sets the native update interval when updateIntervalMs is provided', () => {
    mount(ROOT_TAG, createElement(Probe, { updateIntervalMs: 100 }));

    expect(setUpdateInterval).toHaveBeenCalledWith(100);
  });
});
