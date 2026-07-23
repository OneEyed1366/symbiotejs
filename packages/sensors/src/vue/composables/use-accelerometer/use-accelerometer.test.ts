// Co-located Vue-driven test (ADR 0025) for useAccelerometer. Mocks the whole core module
// (never expo-modules-core internals) since this exercises composable mount/unmount lifecycle
// timing, not any native view — there is none here, so no ViewConfig fixture is needed.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import type { IAccelerometerMeasurement } from '../../../core';
import { useAccelerometer } from './index';

const ROOT_TAG = 9821;

type IListener = (measurement: IAccelerometerMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../../core', () => ({
  Accelerometer: {
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

function mountAccelerometer(updateIntervalMs?: number): Ref<IAccelerometerMeasurement | null> {
  let measurement: Ref<IAccelerometerMeasurement | null> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        measurement = useAccelerometer(updateIntervalMs);
        return () => h('symbiote-text', {}, 'sensor');
      },
    }),
  );
  if (measurement === undefined) {
    throw new Error('setup() did not run');
  }
  return measurement;
}

describe('useAccelerometer (Vue)', () => {
  it('starts null before any measurement arrives', () => {
    const measurement = mountAccelerometer();

    expect(measurement.value).toBeNull();
  });

  it('updates the ref when the native listener fires', () => {
    const measurement = mountAccelerometer();
    const reading: IAccelerometerMeasurement = { x: 0.1, y: 0.2, z: 0.9, timestamp: 123 };

    registeredListener?.(reading);

    expect(measurement.value).toEqual(reading);
  });

  it('removes the subscription on unmount', () => {
    mountAccelerometer();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('sets the update interval once at subscribe time when provided', () => {
    mountAccelerometer(50);

    expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
    expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
  });

  it('does not touch the update interval when omitted', () => {
    mountAccelerometer();

    expect(setUpdateIntervalMock).not.toHaveBeenCalled();
  });
});
