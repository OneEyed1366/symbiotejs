// Co-located React-driven test (ADR 0025), ported from `status-bar-android.smoke.tsx`.
// The Android StatusBar native module is a DIFFERENT shape from iOS
// (setColor(int, animated) / setTranslucent), so it imports status-bar/index.android
// directly (Metro's .android picker isn't active under vitest). The shared fake-Fabric
// slot records the committed tree; a fake __turboModuleProxy returns the Android
// StatusBarManager; a real color processor (setColorProcessor) proves setBackgroundColor
// hands native a PROCESSED int, not the raw CSS string.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, mount, unmount } from '@symbiote/react';
import { setColorProcessor } from '@symbiote/engine';
import { installFabric } from '@symbiote/test-utils';
import { StatusBar } from './index.android';

const STATUS_BAR_HEIGHT = 24;
const RED_HEX = '#ff0000';
const RED_INT = 0xff_ff_00_00; // ARGB: opaque red
const BAR_STYLE = 'light-content';
const ROOT_TAG = 280;

interface IRecordedCall {
  method: string;
  args: unknown[];
}

const recorded: IRecordedCall[] = [];

const fakeStatusBarManager = {
  setStyle(statusBarStyle: string): void {
    recorded.push({ method: 'setStyle', args: [statusBarStyle] });
  },
  setHidden(hidden: boolean): void {
    recorded.push({ method: 'setHidden', args: [hidden] });
  },
  setColor(color: number, animated: boolean): void {
    recorded.push({ method: 'setColor', args: [color, animated] });
  },
  setTranslucent(translucent: boolean): void {
    recorded.push({ method: 'setTranslucent', args: [translucent] });
  },
  getConstants(): { HEIGHT: number } {
    return { HEIGHT: STATUS_BAR_HEIGHT };
  },
};

const registeredModules: Record<string, unknown> = { StatusBarManager: fakeStatusBarManager };

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

Object.assign(globalThis, {
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name];
    if (module === undefined || module === null) return null;
    if (!isType<T>(module)) return null;
    return module;
  },
});

function find(method: string): IRecordedCall | undefined {
  return recorded.find(call => call.method === method);
}
function findAll(method: string): IRecordedCall[] {
  return recorded.filter(call => call.method === method);
}

function App(): ReactElement {
  return (
    <View>
      <StatusBar barStyle={BAR_STYLE} backgroundColor={RED_HEX} translucent />
    </View>
  );
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  recorded.length = 0;
  // '#ff0000' -> the 0xAARRGGBB int RN would produce, proving the string is processed.
  setColorProcessor(value => (value === RED_HEX ? RED_INT : value));
});
afterEach(() => {
  unmount(ROOT_TAG);
  setColorProcessor(value => value);
});

describe('StatusBar (Android)', () => {
  it('routes a processed int through static setBackgroundColor, default animated:false', () => {
    StatusBar.setBackgroundColor(RED_HEX);
    const staticColor = find('setColor');
    expect(staticColor, 'setColor was called').toBeDefined();
    expect(staticColor!.args[0]).toBe(RED_INT);
    expect(staticColor!.args[1]).toBe(false);
  });

  it('routes the boolean through static setTranslucent', () => {
    StatusBar.setTranslucent(true);
    const staticTranslucent = find('setTranslucent');
    expect(staticTranslucent, 'setTranslucent was called').toBeDefined();
    expect(staticTranslucent!.args[0]).toBe(true);
  });

  it('reads currentHeight from the native constant', () => {
    expect(StatusBar.currentHeight).toBe(STATUS_BAR_HEIGHT);
  });

  it('drives setColor / setTranslucent / setStyle from component props', () => {
    mount(ROOT_TAG, <App />);

    // StatusBar renders null, so the committed tree is just the app View.
    expect(fabric.serialize(fabric.appRoot().children)).toBe('RCTView');

    const propColor = find('setColor');
    expect(propColor, 'setColor was called').toBeDefined();
    expect(propColor!.args[0]).toBe(RED_INT);

    const propTranslucent = find('setTranslucent');
    expect(propTranslucent, 'setTranslucent was called').toBeDefined();
    expect(propTranslucent!.args[0]).toBe(true);

    // setStyle fires for barStyle, exactly once per effect run.
    expect(findAll('setStyle')).toHaveLength(1);
    expect(find('setStyle')!.args[0]).toBe(BAR_STYLE);
  });
});
