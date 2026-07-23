// Co-located Vue-driven test (ADR 0025) for useBarometer. Mocks the whole core module
// (never expo-modules-core internals) since this exercises composable mount/unmount lifecycle
// timing, not any native view — there is none here, so no ViewConfig fixture is needed.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import type { IBarometerMeasurement } from '../../../core';
import { useBarometer } from './index';

const ROOT_TAG = 9822;

type IListener = (measurement: IBarometerMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../../core', () => ({
  Barometer: {
    addListener: (listener: IListener) => addListenerMock(listener),
    removeAllListeners: vi.fn(),
    setUpdateInterval: (intervalMs: number) => setUpdateIntervalMock(intervalMs),
  },
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  setUpdateIntervalMock.mockClear();
});

afterEach(() => unmount(ROOT_TAG));

function mountBarometer(updateIntervalMs?: number): Ref<IBarometerMeasurement | null> {
  let measurement: Ref<IBarometerMeasurement | null> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        measurement = useBarometer(updateIntervalMs);
        return () => h('symbiote-text', {}, 'sensor');
      },
    }),
  );
  if (measurement === undefined) {
    throw new Error('setup() did not run');
  }
  return measurement;
}

describe('useBarometer (Vue)', () => {
  it('starts null before any measurement arrives', () => {
    const measurement = mountBarometer();

    expect(measurement.value).toBeNull();
  });

  it('updates the ref when the native listener fires', () => {
    const measurement = mountBarometer();
    const reading: IBarometerMeasurement = {
      pressure: 1013.25,
      relativeAltitude: 12.3,
      timestamp: 123,
    };

    registeredListener?.(reading);

    expect(measurement.value).toEqual(reading);
  });

  it('removes the subscription on unmount', () => {
    mountBarometer();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('sets the update interval once at subscribe time when provided', () => {
    mountBarometer(50);

    expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
    expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
  });

  it('does not touch the update interval when omitted', () => {
    mountBarometer();

    expect(setUpdateIntervalMock).not.toHaveBeenCalled();
  });
});
