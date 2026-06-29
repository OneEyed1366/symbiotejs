// Co-located React-driven test (ADR 0025), ported from the headless `animated-component.smoke`.
// Proves the React Animated component bridge (Phase 2): mount <Animated.View style={{ opacity }}>,
// then drive the value by hand with setValue and assert the new opacity reached the committed view
// through a scoped commit. The per-frame path under test is
// value.setValue -> flushValue -> AnimatedProps.update() -> setNativeProps. No simulator.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const fabric = installFabric();
const ROOT_TAG = 41;

// The app view sits under the synthetic box-none AppContainer root.
function appView(): IFakeNode {
  return fabric.appRoot().children[0];
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Animated component bridge', () => {
  it('setValue on a direct animated style key reaches the committed view', () => {
    const opacity = new Animated.Value(1);

    function App(): ReactElement {
      return <Animated.View style={{ opacity }} />;
    }

    mount(ROOT_TAG, <App />);

    expect(appView().viewName).toBe('RCTView');
    // Initial render reduces the animated value to its current (1).
    expect(appView().props.opacity).toBe(1);

    opacity.setValue(0.3);
    expect(appView().props.opacity).toBe(0.3);
  });

  it('setValue on an interpolated value maps through the leaf', () => {
    const progress = new Animated.Value(0);
    const faded = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    function FadeApp(): ReactElement {
      return <Animated.View style={{ opacity: faded }} />;
    }

    mount(ROOT_TAG, <FadeApp />);

    expect(appView().props.opacity).toBe(0);

    progress.setValue(0.5);
    expect(appView().props.opacity).toBe(0.5);
  });
});
