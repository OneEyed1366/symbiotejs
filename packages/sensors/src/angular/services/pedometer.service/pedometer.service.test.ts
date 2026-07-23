// Co-located Angular-driven test (ADR 0025) for PedometerService. Mounts a real host component
// through @symbiote-native/angular so `connect()` runs the same way an app would call it —
// inside the component's own injection context — and drives the returned signal through a full
// mount/unmount lifecycle, because `effect()`'s injector-scoped cleanup only fires correctly
// when torn down through a real Angular injection context.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import type { IPedometerResult } from '../../../core';
import { PedometerService } from './index';

const watchStepCountMock = vi.fn();
const removeMock = vi.fn();

vi.mock('../../../core', () => ({
  watchStepCount: (listener: (result: IPedometerResult) => void) => watchStepCountMock(listener),
}));

const ROOT_TAG = 942;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const RESULT: IPedometerResult = { steps: 789 };

let capturedResult: Signal<IPedometerResult | null> | undefined;
let capturedListener: ((result: IPedometerResult) => void) | undefined;

@Component({
  selector: 'symbiote-pedometer-host',
  standalone: true,
  template: '',
})
class PedometerHost {
  readonly result = inject(PedometerService).connect();

  constructor() {
    capturedResult = this.result;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  watchStepCountMock.mockImplementation(listener => {
    capturedListener = listener;
    return { remove: removeMock };
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

describe('PedometerService.connect', () => {
  it('reports null before any step count event fires', async () => {
    mount(ROOT_TAG, PedometerHost);
    await tick();

    expect(capturedResult?.()).toBeNull();
  });

  it('updates the signal when the registered listener fires with a result', async () => {
    mount(ROOT_TAG, PedometerHost);
    await tick();

    if (capturedListener === undefined) throw new Error('watchStepCount callback was not captured');
    capturedListener(RESULT);

    expect(capturedResult?.()).toEqual(RESULT);
  });

  it('removes the subscription when the host component is unmounted', async () => {
    mount(ROOT_TAG, PedometerHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
