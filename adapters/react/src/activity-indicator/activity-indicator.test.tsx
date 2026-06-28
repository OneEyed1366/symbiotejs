// Co-located React-driven test (ADR 0025), ported from the headless `activity-indicator.smoke`.
// Asserts the RCTView > ActivityIndicatorView wrapper shape, the animating/color/hidesWhenStopped
// passthrough, the size translation (string sizes map to the native enum + fixed box; a numeric
// size sizes via style and emits no native `size`), plus the standard ViewProps
// (testID/accessibilityLabel/accessible) landing on the wrapper and onLayout routing as a real
// `topLayout` event, all with no simulator.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, ActivityIndicator } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const fabric = installFabric();
const ROOT_TAG = 21;

function findSpinner(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'ActivityIndicatorView');
  if (!node) throw new Error('no ActivityIndicatorView was created');
  return node;
}

function findWrapper(): IFakeNode {
  // Skip the synthetic AppContainer root (RCTView, box-none); the centering wrapper is
  // ActivityIndicator's own RCTView.
  const node = fabric.find(n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none');
  if (!node) throw new Error('no RCTView wrapper was created');
  return node;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('ActivityIndicator', () => {
  it('renders the wrapper shape and maps a string size to the native enum + fixed box', () => {
    function StringSizeApp(): ReactElement {
      return <ActivityIndicator size="large" color="#0000ff" animating={false} />;
    }
    mount(ROOT_TAG, <StringSizeApp />);

    expect(fabric.serialize(fabric.appRoot().children)).toBe('RCTView(ActivityIndicatorView)');

    const spinner = findSpinner();
    expect(spinner.props.animating).toBe(false);
    expect(spinner.props.color).toBe('#0000ff');
    expect(spinner.props.hidesWhenStopped).toBe(true);
    expect(spinner.props.size).toBe('large');
    // The engine flattens `style` onto the top-level props payload, so width/height land directly.
    expect(spinner.props.width).toBe(36);
    expect(spinner.props.height).toBe(36);

    const wrapper = findWrapper();
    expect(wrapper.props.alignItems).toBe('center');
    expect(wrapper.props.justifyContent).toBe('center');
  });

  it('sizes a numeric size via style, emits no native size, and defaults animating/color', () => {
    function NumericSizeApp(): ReactElement {
      return <ActivityIndicator size={48} />;
    }
    mount(ROOT_TAG, <NumericSizeApp />);

    const spinner = findSpinner();
    expect('size' in spinner.props).toBe(false);
    expect(spinner.props.width).toBe(48);
    expect(spinner.props.height).toBe(48);
    expect(spinner.props.animating).toBe(true);
    expect(spinner.props.color).toBe('#999999');
  });

  it('passes standard ViewProps to the wrapper and routes onLayout as topLayout', () => {
    const TEST_ID = 'spinner-wrapper';
    const ACCESSIBILITY_LABEL = 'loading';
    let layoutFired = false;

    function PropsApp(): ReactElement {
      return (
        <ActivityIndicator
          testID={TEST_ID}
          accessibilityLabel={ACCESSIBILITY_LABEL}
          accessible={true}
          onLayout={() => {
            layoutFired = true;
          }}
        />
      );
    }
    mount(ROOT_TAG, <PropsApp />);

    // testID/accessibilityLabel/accessible land on the centering wrapper View (RN spreads `...props`).
    const wrapper = findWrapper();
    expect(wrapper.props.testID).toBe(TEST_ID);
    expect(wrapper.props.accessibilityLabel).toBe(ACCESSIBILITY_LABEL);
    expect(wrapper.props.accessible).toBe(true);

    // onLayout is a BASE event in the engine's ViewConfig: firing topLayout calls the handler.
    fabric.fireEvent(wrapper.instanceHandle, 'topLayout', {});
    expect(layoutFired).toBe(true);
  });
});
