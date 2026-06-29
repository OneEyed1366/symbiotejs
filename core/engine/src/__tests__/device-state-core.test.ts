// Co-located unit test (ADR 0025): the device-state modules (Dimensions / AppState / Appearance,
// in @symbiote/engine) plus the pure KeyboardAvoidingView math (in @symbiote/components). A fake
// __turboModuleProxy returns the native modules; a fake RN$registerCallableModule captures the
// device hub so the test plays "native" and emits didUpdateDimensions / appStateDidChange /
// appearanceChanged.

import { beforeAll, describe, expect, it } from 'vitest';
import { Dimensions } from '../dimensions';
import { AppState } from '../app-state';
import { Appearance } from '../appearance';
import {
  computeInset,
  readKeyboardFrame,
  readLayoutFrame,
  resolveKeyboardAvoidingLayout,
} from '../../../components/src/view/render-keyboard-avoiding-view';

type IDeviceHub = { emit: (eventType: string, ...args: unknown[]) => void };

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

const INITIAL_WINDOW = { width: 400, height: 800, scale: 3, fontScale: 2 };

const fakeDeviceInfo = {
  getConstants: () => ({ Dimensions: { window: INITIAL_WINDOW } }),
};
const fakeAppState = {
  getConstants: () => ({ initialAppState: 'active' }),
  addListener: (): void => {},
  removeListeners: (): void => {},
};
let currentScheme: 'light' | 'dark' | null = 'light';
const fakeAppearance = {
  getColorScheme: (): 'light' | 'dark' | null => currentScheme,
  setColorScheme: (scheme: 'light' | 'dark' | 'unspecified'): void => {
    currentScheme = scheme === 'unspecified' ? null : scheme;
  },
  addListener: (): void => {},
  removeListeners: (): void => {},
};

const registeredModules: Record<string, unknown> = {
  DeviceInfo: fakeDeviceInfo,
  AppState: fakeAppState,
  Appearance: fakeAppearance,
};

let deviceHub: IDeviceHub | undefined;

beforeAll(() => {
  Object.assign(globalThis, {
    __turboModuleProxy: <T>(name: string): T | null => {
      const module = registeredModules[name];
      return isType<T>(module) ? module : null;
    },
    RN$registerCallableModule: (name: string, factory: () => IDeviceHub): void => {
      if (name === 'RCTDeviceEventEmitter') deviceHub = factory();
    },
  });
});

function requireHub(): IDeviceHub {
  if (deviceHub === undefined) throw new Error('the device hub was never installed');
  return deviceHub;
}

describe('Dimensions', () => {
  it('resolves from DeviceInfo and mirrors window to screen on iOS', () => {
    expect(Dimensions.get('window').width).toBe(400);
    expect(Dimensions.get('screen').width).toBe(400);
    // The first resolve installs the device hub.
    expect(deviceHub).toBeDefined();
  });

  it("fires 'change' and updates the cache on a native didUpdateDimensions", () => {
    let changed: { window: { width: number } } | undefined;
    const sub = Dimensions.addEventListener('change', set => {
      changed = set;
    });
    requireHub().emit('didUpdateDimensions', {
      window: { width: 500, height: 900, scale: 3, fontScale: 2 },
    });
    expect(changed?.window.width).toBe(500);
    expect(Dimensions.get('window').width).toBe(500);
    sub.remove();
  });
});

describe('AppState', () => {
  it("seeds 'active' and reports availability", () => {
    expect(AppState.currentState).toBe('active');
    expect(AppState.isAvailable).toBe(true);
  });

  it("fires 'change' and tracks the current state on appStateDidChange", () => {
    let value: unknown;
    const sub = AppState.addEventListener('change', next => {
      value = next;
    });
    requireHub().emit('appStateDidChange', { app_state: 'background' });
    expect(value).toBe('background');
    expect(AppState.currentState).toBe('background');
    sub.remove();
  });
});

describe('Appearance', () => {
  it('reads and reports color-scheme changes on appearanceChanged', () => {
    expect(Appearance.getColorScheme()).toBe('light');
    let changed: { colorScheme: 'light' | 'dark' | null } | undefined;
    const sub = Appearance.addChangeListener(prefs => {
      changed = prefs;
    });
    requireHub().emit('appearanceChanged', { colorScheme: 'dark' });
    expect(changed?.colorScheme).toBe('dark');
    expect(Appearance.getColorScheme()).toBe('dark');
    sub.remove();
  });
});

describe('KeyboardAvoidingView pure logic', () => {
  const frame = readLayoutFrame({ y: 0, height: 800 });
  const keyboard = readKeyboardFrame({ endCoordinates: { screenY: 500, height: 300 } });

  it('extracts the layout and keyboard frames', () => {
    expect(frame?.y).toBe(0);
    expect(frame?.height).toBe(800);
    expect(keyboard?.screenY).toBe(500);
    expect(keyboard?.height).toBe(300);
  });

  it('computes the overlap inset, honoring verticalOffset and clamping at 0', () => {
    // view bottom = 0 + 800 = 800; keyboard top = 500; offset 0 -> inset = 300.
    expect(computeInset(frame, keyboard, 0)).toBe(300);
    // a vertical offset of 50 raises the keyboard line -> inset 350.
    expect(computeInset(frame, keyboard, 50)).toBe(350);
    // no overlap (keyboard below the view) clamps at 0.
    expect(computeInset({ y: 0, height: 100 }, keyboard, 0)).toBe(0);
  });

  it("folds paddingBottom into the wrapper for behavior 'padding'", () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'padding',
      effectiveInset: 300,
      style: { flex: 1 },
    });
    expect(layout.kind).toBe('wrapper');
    expect(layout.kind === 'wrapper' && Array.isArray(layout.wrapperStyle)).toBe(true);
    if (layout.kind === 'wrapper' && Array.isArray(layout.wrapperStyle)) {
      expect(layout.wrapperStyle[1]).toEqual({ paddingBottom: 300 });
    }
  });

  it("nests with bottom: inset for behavior 'position'", () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'position',
      effectiveInset: 120,
      contentContainerStyle: { padding: 8 },
    });
    expect(layout.kind).toBe('nested');
    if (layout.kind === 'nested' && Array.isArray(layout.innerStyle)) {
      expect(layout.innerStyle[1]).toEqual({ bottom: 120 });
    }
  });

  it("shrinks from the initial height for behavior 'height'", () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'height',
      effectiveInset: 200,
      initialHeight: 800,
    });
    expect(layout.kind).toBe('wrapper');
    if (layout.kind === 'wrapper' && Array.isArray(layout.wrapperStyle)) {
      expect(layout.wrapperStyle[1]).toEqual({ height: 600, flex: 0 });
    }
  });

  it('leaves height mode untouched when disabled (effectiveInset 0)', () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'height',
      effectiveInset: 0,
      initialHeight: 800,
      style: { flex: 1 },
    });
    expect(layout.kind).toBe('wrapper');
    if (layout.kind === 'wrapper') {
      expect(layout.wrapperStyle).toEqual({ flex: 1 });
    }
  });
});
