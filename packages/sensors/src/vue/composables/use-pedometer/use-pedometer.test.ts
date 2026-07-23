// Co-located Vue-driven test (ADR 0025) for usePedometer. Mocks the whole core module (never
// expo-modules-core internals) since this exercises composable mount/unmount lifecycle timing,
// not any native view — there is none here, so no ViewConfig fixture is needed.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import type { IPedometerResult } from '../../../core';
import { usePedometer } from './index';

const ROOT_TAG = 9822;

type IListener = (result: IPedometerResult) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn();
const watchStepCountMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});

vi.mock('../../../core', () => ({
  watchStepCount: (listener: IListener) => watchStepCountMock(listener),
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  watchStepCountMock.mockClear();
  removeMock.mockClear();
});

afterEach(() => unmount(ROOT_TAG));

function mountPedometer(): Ref<IPedometerResult | null> {
  let result: Ref<IPedometerResult | null> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        result = usePedometer();
        return () => h('symbiote-text', {}, 'pedometer');
      },
    }),
  );
  if (result === undefined) {
    throw new Error('setup() did not run');
  }
  return result;
}

describe('usePedometer (Vue)', () => {
  it('starts null before any step count arrives', () => {
    const result = mountPedometer();

    expect(result.value).toBeNull();
  });

  it('updates the ref when the native listener fires', () => {
    const result = mountPedometer();
    const reading: IPedometerResult = { steps: 456 };

    registeredListener?.(reading);

    expect(result.value).toEqual(reading);
  });

  it('removes the subscription on unmount', () => {
    mountPedometer();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
