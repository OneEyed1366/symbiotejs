// Co-located React-driven test (ADR 0025), ported from the headless `animated-event.smoke`.
// Proves Animated.event: the JS path and its native attach wiring. The shared fake Fabric slot
// keeps each view's real reactTag so a scoped setNativeProps commit is observable; a fake
// NativeAnimatedTurboModule records the native-event registration. No simulator.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote/react';
import { event, AnimatedEvent } from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

// ---- fake NativeAnimatedTurboModule (records calls) ----------------------

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

const fakeNativeAnimated = {
  createAnimatedNode: record('createAnimatedNode'),
  connectAnimatedNodes: record('connectAnimatedNodes'),
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode: record('startAnimatingNode'),
  stopAnimation: record('stopAnimation'),
  setAnimatedNodeValue: record('setAnimatedNodeValue'),
  setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
  flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
  extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
  startListeningToAnimatedNodeValue: record('startListeningToAnimatedNodeValue'),
  stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
  getValue: record('getValue'),
  addAnimatedEventToView: record('addAnimatedEventToView'),
  removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
};
Object.assign(globalThis, {
  nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
});

const fabric = installFabric();
const ROOT_TAG = 41;

function appView(): IFakeNode {
  return fabric.appRoot().children[0];
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

// translateY read off the committed view's flattened transform. The scoped setNativeProps commit
// hoists `style` onto the view, so transform lands on props.
function committedTranslateY(view: IFakeNode): number {
  const transform = Reflect.get(view.props, 'transform');
  if (!Array.isArray(transform)) {
    throw new Error(`expected a transform array on the view, got ${JSON.stringify(view.props)}`);
  }
  for (const entry of transform) {
    if (typeof entry === 'object' && entry !== null) {
      const y = Reflect.get(entry, 'translateY');
      if (typeof y === 'number') return y;
    }
  }
  throw new Error(`no translateY in committed transform ${JSON.stringify(transform)}`);
}

beforeEach(() => {
  fabric.reset();
  nativeCalls.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

describe('Animated.event', () => {
  it('drives a bound translateY from a real scroll event and forwards the raw arg', () => {
    const scrollY = new Animated.Value(0);

    function App(): ReactElement {
      return <Animated.View style={{ transform: [{ translateY: scrollY }] }} />;
    }

    mount(ROOT_TAG, <App />);

    // the view paints at the initial value before any event fires
    expect(committedTranslateY(appView())).toBe(0);

    let listenerArg: unknown = null;
    const handler = event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      listener: arg => {
        listenerArg = arg;
      },
    });

    const scrollEvent = { nativeEvent: { contentOffset: { y: 42 } } };
    handler(scrollEvent);

    expect(committedTranslateY(appView())).toBe(42);
    expect(listenerArg).toBe(scrollEvent);
  });

  it('registers and removes the native event mapping on __attach / __detach', () => {
    const scrollY = new Animated.Value(0);

    function App(): ReactElement {
      return <Animated.View style={{ transform: [{ translateY: scrollY }] }} />;
    }

    mount(ROOT_TAG, <App />);
    const viewTag = appView().tag;

    const handler = event([{ nativeEvent: { contentOffset: { y: scrollY } } }]);
    const animatedEvent = handler.__getEvent();
    expect(animatedEvent).toBeInstanceOf(AnimatedEvent);

    animatedEvent.__attach(viewTag, 'onScroll');

    const added = callsOf('addAnimatedEventToView');
    expect(added).toHaveLength(1);
    const [addedViewTag, addedEventName, addedMapping] = added[0].args;
    expect(addedViewTag).toBe(viewTag);
    expect(addedEventName).toBe('onScroll');
    expect(typeof addedMapping === 'object' && addedMapping !== null).toBe(true);

    const nativeEventPath =
      typeof addedMapping === 'object' && addedMapping !== null
        ? Reflect.get(addedMapping, 'nativeEventPath')
        : undefined;
    expect(Array.isArray(nativeEventPath) ? nativeEventPath.join('.') : undefined).toBe(
      'contentOffset.y',
    );

    const animatedValueTag =
      typeof addedMapping === 'object' && addedMapping !== null
        ? Reflect.get(addedMapping, 'animatedValueTag')
        : undefined;
    expect(animatedValueTag).toBe(scrollY.__getNativeTag());

    // detach unregisters against the same value tag
    animatedEvent.__detach(viewTag, 'onScroll');
    const removed = callsOf('removeAnimatedEventFromView');
    expect(removed).toHaveLength(1);
    expect(removed[0].args[2]).toBe(scrollY.__getNativeTag());
  });
});
