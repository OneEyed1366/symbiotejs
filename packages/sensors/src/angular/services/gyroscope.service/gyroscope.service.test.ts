// Co-located Angular-driven test (ADR 0025) for GyroscopeService. Mounts a real host
// component through @symbiote-native/angular so `connect()` runs the same way an app would call
// it — inside the component's own injection context — and drives the returned signal through a
// full mount/unmount lifecycle, because `effect()`'s injector-scoped cleanup only fires
// correctly when torn down through a real Angular injection context.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import type { IGyroscopeMeasurement } from '../../../core';
import { GyroscopeService } from './index';

const addListenerMock = vi.fn();
const removeMock = vi.fn();
const setUpdateIntervalMock = vi.fn();

vi.mock('../../../core', () => ({
  Gyroscope: {
    addListener: (listener: (measurement: IGyroscopeMeasurement) => void) =>
      addListenerMock(listener),
    setUpdateInterval: (intervalMs: number) => setUpdateIntervalMock(intervalMs),
  },
}));

const ROOT_TAG = 942;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const MEASUREMENT: IGyroscopeMeasurement = { x: 0.1, y: 0.2, z: 0.3, timestamp: 123 };

let capturedResult: Signal<IGyroscopeMeasurement | null> | undefined;
let capturedListener: ((measurement: IGyroscopeMeasurement) => void) | undefined;

@Component({
  selector: 'symbiote-gyroscope-host',
  standalone: true,
  template: '',
})
class GyroscopeHost {
  readonly measurement = inject(GyroscopeService).connect();

  constructor() {
    capturedResult = this.measurement;
  }
}

@Component({
  selector: 'symbiote-gyroscope-interval-host',
  standalone: true,
  template: '',
})
class GyroscopeIntervalHost {
  readonly measurement = inject(GyroscopeService).connect(500);

  constructor() {
    capturedResult = this.measurement;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  addListenerMock.mockImplementation(listener => {
    capturedListener = listener;
    return { remove: removeMock };
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

describe('GyroscopeService.connect', () => {
  it('reports null before any measurement event fires', async () => {
    mount(ROOT_TAG, GyroscopeHost);
    await tick();

    expect(capturedResult?.()).toBeNull();
  });

  it('updates the signal when the registered listener fires with a measurement', async () => {
    mount(ROOT_TAG, GyroscopeHost);
    await tick();

    if (capturedListener === undefined) throw new Error('addListener callback was not captured');
    capturedListener(MEASUREMENT);

    expect(capturedResult?.()).toEqual(MEASUREMENT);
  });

  it('removes the subscription when the host component is unmounted', async () => {
    mount(ROOT_TAG, GyroscopeHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });

  it('calls setUpdateInterval with the given interval when one is passed', async () => {
    mount(ROOT_TAG, GyroscopeIntervalHost);
    await tick();

    expect(setUpdateIntervalMock).toHaveBeenCalledWith(500);
  });

  it('does not call setUpdateInterval when no interval is passed', async () => {
    mount(ROOT_TAG, GyroscopeHost);
    await tick();

    expect(setUpdateIntervalMock).not.toHaveBeenCalled();
  });
});
