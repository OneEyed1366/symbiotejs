// Co-located Vue-driven test (ADR 0025) for useDeviceMotion. Mocks the whole core module
// (never expo-modules-core internals) since this exercises composable mount/unmount lifecycle
// timing, not any native view — there is none here, so no ViewConfig fixture is needed.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import type { IDeviceMotionMeasurement } from '../../../core';
import { useDeviceMotion } from './index';

const ROOT_TAG = 9822;

type IListener = (measurement: IDeviceMotionMeasurement) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const setUpdateIntervalMock = vi.fn();

vi.mock('../../../core', () => ({
  DeviceMotion: {
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

function mountDeviceMotion(updateIntervalMs?: number): Ref<IDeviceMotionMeasurement | null> {
  let measurement: Ref<IDeviceMotionMeasurement | null> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        measurement = useDeviceMotion(updateIntervalMs);
        return () => h('symbiote-text', {}, 'sensor');
      },
    }),
  );
  if (measurement === undefined) {
    throw new Error('setup() did not run');
  }
  return measurement;
}

const READING: IDeviceMotionMeasurement = {
  acceleration: { x: 0.1, y: 0.2, z: 0.3, timestamp: 123 },
  accelerationIncludingGravity: { x: 0.1, y: 0.2, z: 9.9, timestamp: 123 },
  rotation: { alpha: 1, beta: 2, gamma: 3, timestamp: 123 },
  rotationRate: { alpha: 0.1, beta: 0.2, gamma: 0.3, timestamp: 123 },
  interval: 16,
  orientation: 0, // DeviceMotionOrientation.Portrait
};

describe('useDeviceMotion (Vue)', () => {
  it('starts null before any measurement arrives', () => {
    const measurement = mountDeviceMotion();

    expect(measurement.value).toBeNull();
  });

  it('updates the ref when the native listener fires', () => {
    const measurement = mountDeviceMotion();

    registeredListener?.(READING);

    expect(measurement.value).toEqual(READING);
  });

  it('removes the subscription on unmount', () => {
    mountDeviceMotion();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('sets the update interval once at subscribe time when provided', () => {
    mountDeviceMotion(50);

    expect(setUpdateIntervalMock).toHaveBeenCalledWith(50);
    expect(setUpdateIntervalMock).toHaveBeenCalledTimes(1);
  });

  it('does not touch the update interval when omitted', () => {
    mountDeviceMotion();

    expect(setUpdateIntervalMock).not.toHaveBeenCalled();
  });
});
