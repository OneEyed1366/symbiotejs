// Co-located Vue-driven test (ADR 0025) for useLightSensor. Mocks the whole core module
// (never expo-modules-core internals) since this exercises composable mount/unmount lifecycle
// timing, not any native view — there is none here, so no ViewConfig fixture is needed.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import type { ILightSensorMeasurement } from '../../../core';
import { useLightSensor } from './index';

const ROOT_TAG = 9822;

type IListener = (measurement: ILightSensorMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../../core', () => ({
  LightSensor: {
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

function mountLightSensor(updateIntervalMs?: number): Ref<ILightSensorMeasurement | null> {
  let measurement: Ref<ILightSensorMeasurement | null> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        measurement = useLightSensor(updateIntervalMs);
        return () => h('symbiote-text', {}, 'sensor');
      },
    }),
  );
  if (measurement === undefined) {
    throw new Error('setup() did not run');
  }
  return measurement;
}

describe('useLightSensor (Vue)', () => {
  it('starts null before any measurement arrives', () => {
    const measurement = mountLightSensor();

    expect(measurement.value).toBeNull();
  });

  it('updates the ref when the native listener fires', () => {
    const measurement = mountLightSensor();
    const reading: ILightSensorMeasurement = { illuminance: 42, timestamp: 123 };

    registeredListener?.(reading);

    expect(measurement.value).toEqual(reading);
  });

  it('removes the subscription on unmount', () => {
    mountLightSensor();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('sets the update interval once at subscribe time when provided', () => {
    mountLightSensor(50);

    expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
    expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
  });

  it('does not touch the update interval when omitted', () => {
    mountLightSensor();

    expect(setUpdateIntervalMock).not.toHaveBeenCalled();
  });
});
