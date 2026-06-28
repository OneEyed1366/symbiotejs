// Co-located React-driven ScrollView test (ADR 0025), ported from the headless smoke.
// Proves the nested RCTScrollView > RCTScrollContentView shape, the contentContainerStyle /
// horizontal -> content-node mapping, the base clip styles on both axes, and the onScroll
// round-trip, against the fake Fabric slot, no simulator.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, mount, unmount } from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';
// ScrollView isn't on the iOS-resolved barrel for the horizontal app below, so reach the source
// directly the way the smoke did (resolves identically from examples/react).
import { ScrollView } from './index';

const ROOT_TAG = 51;

// onScroll payload recorder, owned by the horizontal App. Reset per test after fabric.reset().
let scrolled: Record<string, unknown> | undefined;

function HorizontalApp(): ReactElement {
  return (
    <ScrollView
      contentContainerStyle={{ padding: 8 }}
      horizontal
      onScroll={event => {
        scrolled = event.nativeEvent;
      }}
    >
      <View />
    </ScrollView>
  );
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  scrolled = undefined;
});
afterEach(() => unmount(ROOT_TAG));

describe('React ScrollView on the engine', () => {
  it('commits the nested scroll view shape under a box-none AppContainer', () => {
    mount(ROOT_TAG, <HorizontalApp />);
    expect(fabric.serialize(fabric.appRoot().children)).toBe(
      'RCTScrollView(RCTScrollContentView(RCTView))',
    );
  });

  it('maps contentContainerStyle + horizontal onto the content node', () => {
    mount(ROOT_TAG, <HorizontalApp />);

    const content = fabric.find(node => node.viewName === 'RCTScrollContentView');
    expect(content, 'RCTScrollContentView was created').toBeDefined();
    expect(content!.props.padding).toBe(8);
    expect(content!.props.flexDirection).toBe('row');
  });

  it('keeps content padding off the outer node and gives it the horizontal base style', () => {
    mount(ROOT_TAG, <HorizontalApp />);

    const outer = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();
    // `padding` is a content-container style and must NOT leak onto the scroll view node.
    expect('padding' in outer!.props).toBe(false);
    // flexDirection:'row' on the scroll view NODE is RN's styles.baseHorizontal: Yoga sizes the
    // content child along the scroll axis so the row overflows and scrolls.
    expect(outer!.props.flexDirection).toBe('row');
    // overflow:'scroll' clips content to the frame, RN's base style on both axes.
    expect(outer!.props.overflow).toBe('scroll');
    // horizontal must reach the native scroll view as a bool: iOS RCTScrollView keys its axis off it.
    expect(outer!.props.horizontal).toBe(true);
  });

  it('delivers the onScroll native event to the handler verbatim', () => {
    mount(ROOT_TAG, <HorizontalApp />);

    const outer = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();

    const payload = {
      contentOffset: { x: 0, y: 10 },
      contentSize: { width: 100, height: 400 },
      layoutMeasurement: { width: 100, height: 200 },
    };
    fabric.fireEvent(outer!.instanceHandle, 'topScroll', payload);
    expect(scrolled, 'onScroll fired').toBeDefined();
    expect(scrolled).toBe(payload);
  });

  it('carries the vertical base clip and lets a user style win over it', () => {
    // Regression guard for the iOS bleed: a vertical scroll view used to get NO base style, so
    // overflow was never set and iOS didn't clip. It must now match RN's baseVertical.
    mount(
      ROOT_TAG,
      <ScrollView style={{ height: 120 }}>
        <View />
      </ScrollView>,
    );

    const vertical = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(vertical, 'vertical RCTScrollView was created').toBeDefined();
    expect(vertical!.props.overflow).toBe('scroll');
    expect(vertical!.props.flexDirection).toBe('column');
    // A user style still wins over the base: the explicit height must survive the merge.
    expect(vertical!.props.height).toBe(120);
  });
});
