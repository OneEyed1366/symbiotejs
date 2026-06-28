// Co-located React-driven test (ADR 0025), ported from `status-bar.smoke.tsx`.
// Proves the StatusBar primitive, the first JS->native consumer of the native-module
// bridge. The shared fake-Fabric slot records the committed tree; a fake
// __turboModuleProxy returns a StatusBarManager that records its calls. We mount
// <View><StatusBar .../></View> and assert StatusBar's effect drove the recorded native
// setters with the values our prop->method mapping sends.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusBar, View, mount, unmount } from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';

const BAR_STYLE = 'dark-content';
const ROOT_TAG = 270;

interface IRecordedCall {
  method: string;
  args: unknown[];
}

const recorded: IRecordedCall[] = [];

const fakeStatusBarManager = {
  setStyle(statusBarStyle: string, animated: boolean): void {
    recorded.push({ method: 'setStyle', args: [statusBarStyle, animated] });
  },
  setHidden(hidden: boolean, withAnimation: string): void {
    recorded.push({ method: 'setHidden', args: [hidden, withAnimation] });
  },
  setNetworkActivityIndicatorVisible(visible: boolean): void {
    recorded.push({ method: 'setNetworkActivityIndicatorVisible', args: [visible] });
  },
};

const registeredModules: Record<string, unknown> = { StatusBarManager: fakeStatusBarManager };

// The fake proxy hands back a value the caller typed as T; this one guard is the fake's
// own trust boundary (the real native proxy returns a HostObject directly).
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

function App(): ReactElement {
  return (
    <View>
      <StatusBar barStyle={BAR_STYLE} hidden animated />
    </View>
  );
}

function find(method: string): IRecordedCall | undefined {
  return recorded.find(call => call.method === method);
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  recorded.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('StatusBar (iOS)', () => {
  it('renders null — only the app View sits under the container', () => {
    mount(ROOT_TAG, <App />);
    expect(fabric.serialize(fabric.appRoot().children)).toBe('RCTView');
  });

  it('drives setStyle with the bar style and the animated flag', () => {
    mount(ROOT_TAG, <App />);
    const styleCall = find('setStyle');
    expect(styleCall, 'setStyle was called').toBeDefined();
    expect(styleCall!.args).toEqual([BAR_STYLE, true]);
  });

  it('drives setHidden(true, "fade") for hidden + animated', () => {
    mount(ROOT_TAG, <App />);
    const hiddenCall = find('setHidden');
    expect(hiddenCall, 'setHidden was called').toBeDefined();
    expect(hiddenCall!.args).toEqual([true, 'fade']);
  });

  it('never calls the network-activity setter when its prop is omitted', () => {
    mount(ROOT_TAG, <App />);
    expect(find('setNetworkActivityIndicatorVisible')).toBeUndefined();
  });
});
