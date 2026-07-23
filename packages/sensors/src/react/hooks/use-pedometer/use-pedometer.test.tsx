// Co-located React-driven test (ADR 0025) for usePedometer. Mocks the whole `core` module
// rather than expo-modules-core internals — this hook's own lifecycle wiring (subscribe/
// unsubscribe) is what's under test, not the core port itself, which already has its own
// coverage in packages/sensors/src/core/pedometer.test.ts.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { usePedometer } from './index';
import type { IPedometerResult } from '../../../core';

const { watchStepCount, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    watchStepCount: vi.fn((_callback: (result: IPedometerResult) => void) => ({ remove })),
    remove,
  };
});

vi.mock('../../../core', () => ({ watchStepCount }));

const ROOT_TAG = 902;

const results: Array<IPedometerResult | null> = [];

function Probe(): ReactElement {
  results.push(usePedometer());
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

describe('usePedometer', () => {
  it('reports null before any native step count arrives', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toBeNull();
  });

  it('updates to the latest result once the native listener fires', async () => {
    mount(ROOT_TAG, createElement(Probe));

    const result: IPedometerResult = { steps: 123 };
    const listener = watchStepCount.mock.calls[0][0];
    listener(result);

    // The mock invokes the listener directly, outside the engine's event dispatcher
    // (setEventDispatcher in render.ts), which is what normally flushes a native-driven
    // setState synchronously — so the resulting re-render lands on a later microtask here.
    await vi.waitFor(() => expect(results[results.length - 1]).toEqual(result));
  });

  it('unsubscribes from the native listener on unmount', () => {
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
