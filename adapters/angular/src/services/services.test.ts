import '@angular/compiler';
import { Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Appearance, Dimensions } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../render';
import { ColorSchemeService } from './color-scheme.service';
import { WindowDimensionsService } from './window-dimensions.service';

const ROOT_TAG = 900;
const fabric = installFabric();

let capturedColorSchemeService: ColorSchemeService | undefined;
let capturedWindowDimensionsService: WindowDimensionsService | undefined;

@Component({
  selector: 'symbiote-color-scheme-consumer',
  standalone: true,
  providers: [ColorSchemeService],
  template: '',
})
class ColorSchemeConsumer {
  readonly service = inject(ColorSchemeService);
  constructor() {
    capturedColorSchemeService = this.service;
  }
}

@Component({
  selector: 'symbiote-window-dimensions-consumer',
  standalone: true,
  providers: [WindowDimensionsService],
  template: '',
})
class WindowDimensionsConsumer {
  readonly service = inject(WindowDimensionsService);
  constructor() {
    capturedWindowDimensionsService = this.service;
  }
}

@Component({
  selector: 'symbiote-root-window-dimensions-consumer',
  standalone: true,
  template: '',
})
class RootWindowDimensionsConsumer {
  readonly service = inject(WindowDimensionsService);
  constructor() {
    capturedWindowDimensionsService = this.service;
  }
}

beforeEach(() => {
  capturedColorSchemeService = undefined;
  capturedWindowDimensionsService = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.restoreAllMocks();
});

describe('Angular DI services over engine modules', () => {
  it('ColorSchemeService subscribes to Appearance and cleans up on unmount', async () => {
    type IGenericListener = (...args: unknown[]) => void;
    const activeListeners = new Set<IGenericListener>();
    let emitToListeners: (preferences: { colorScheme: 'light' | 'dark' | null }) => void = () => {};

    vi.spyOn(Appearance, 'getColorScheme').mockReturnValue('light');
    vi.spyOn(Appearance, 'addChangeListener').mockImplementation(listener => {
      activeListeners.add(listener as IGenericListener);
      emitToListeners = preferences => {
        for (const l of activeListeners) l(preferences);
      };
      return {
        remove: () => {
          activeListeners.delete(listener as IGenericListener);
        },
      };
    });

    mount(ROOT_TAG, ColorSchemeConsumer);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const service = capturedColorSchemeService;
    if (!service) throw new Error('ColorSchemeService was not captured');

    expect(service.colorScheme()).toBe('light');
    expect(Appearance.addChangeListener).toHaveBeenCalledOnce();

    emitToListeners({ colorScheme: 'dark' });
    expect(service.colorScheme()).toBe('dark');

    emitToListeners({ colorScheme: 'light' });
    expect(service.colorScheme()).toBe('light');

    unmount(ROOT_TAG);
    expect(activeListeners.size).toBe(0);

    // After unmount, the signal must stop reacting to further events.
    emitToListeners({ colorScheme: 'dark' });
    expect(service.colorScheme()).toBe('light');
  });

  it('provides WindowDimensionsService from the Symbiote root injector', async () => {
    const initialMetrics = { width: 100, height: 200, scale: 1, fontScale: 1 };
    vi.spyOn(Dimensions, 'get').mockReturnValue(initialMetrics);
    vi.spyOn(Dimensions, 'addEventListener').mockReturnValue({ remove: vi.fn() });

    mount(ROOT_TAG, RootWindowDimensionsConsumer);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(capturedWindowDimensionsService?.dimensions()).toEqual(initialMetrics);
  });

  it('WindowDimensionsService subscribes to Dimensions and ignores no-op updates', async () => {
    const remove = vi.fn();
    let capturedListener:
      | ((set: {
          window: { width: number; height: number; scale: number; fontScale: number };
          screen: { width: number; height: number; scale: number; fontScale: number };
        }) => void)
      | undefined;

    const initialMetrics = { width: 100, height: 200, scale: 1, fontScale: 1 };
    vi.spyOn(Dimensions, 'get').mockReturnValue(initialMetrics);
    vi.spyOn(Dimensions, 'addEventListener').mockImplementation((_type, listener) => {
      capturedListener = set =>
        listener(set as { window: typeof initialMetrics; screen: typeof initialMetrics });
      return { remove };
    });

    mount(ROOT_TAG, WindowDimensionsConsumer);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const service = capturedWindowDimensionsService;
    if (!service) throw new Error('WindowDimensionsService was not captured');

    const initial = service.dimensions();
    expect(initial).toEqual(initialMetrics);
    expect(Dimensions.addEventListener).toHaveBeenCalledOnce();

    // Same metrics: signal identity must be preserved (equality guard).
    capturedListener?.({
      window: { width: 100, height: 200, scale: 1, fontScale: 1 },
      screen: { width: 100, height: 200, scale: 1, fontScale: 1 },
    });
    expect(service.dimensions()).toBe(initial);

    // Different metrics: signal updates.
    capturedListener?.({
      window: { width: 300, height: 400, scale: 2, fontScale: 2 },
      screen: { width: 300, height: 400, scale: 2, fontScale: 2 },
    });
    expect(service.dimensions()).toEqual({ width: 300, height: 400, scale: 2, fontScale: 2 });

    unmount(ROOT_TAG);
    expect(remove).toHaveBeenCalledOnce();
  });
});
