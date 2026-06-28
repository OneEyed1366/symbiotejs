// Co-located test (ADR 0025) for the ANDROID ScrollView RefreshControl WRAP style routing,
// ported from the headless smoke. On Android a RefreshControl WRAPS the scroll view
// (AndroidSwipeRefreshLayout is the parent). RN splits the user `style` (splitLayoutProps):
// LAYOUT -> wrapper, VISUAL -> inner scroll view. We assert that split.
//
// The barrel ScrollView resolves to the iOS build under vitest, so to test the Android wrap we
// import scroll-view/index.android directly. RefreshControl is platform-agnostic (barrel).
//
// HEADLESS LIMITATION: the intrinsic->native-name table resolves to the iOS build, so the
// RefreshControl node serializes as the iOS native name 'PullToRefreshView' rather than
// Android's 'AndroidSwipeRefreshLayout'. The Android wrap LOGIC under test is identical; the
// style-split assertions key off node ROLE, not native name, so the limitation doesn't weaken them.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, RefreshControl, mount, unmount } from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';
import { ScrollView } from './index.android';

const ROOT_TAG = 52;

// A VERTICAL ScrollView WITH a refreshControl and a style mixing LAYOUT (height, margin) and
// VISUAL (backgroundColor, padding) props: exactly the split the wrap must route.
function App(): ReactElement {
  return (
    <ScrollView
      style={{ height: 200, backgroundColor: '#123', padding: 8, margin: 4 }}
      refreshControl={<RefreshControl refreshing={false} />}
    >
      <View />
    </ScrollView>
  );
}

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Android ScrollView RefreshControl wrap', () => {
  it('wraps RCTScrollView in the RefreshControl node under a box-none AppContainer', () => {
    mount(ROOT_TAG, <App />);

    const shape = fabric.serialize(fabric.appRoot().children);
    // The wrap shape: the RefreshControl node WRAPS RCTScrollView, which holds the content.
    expect(shape.endsWith('(RCTScrollView(RCTScrollContentView(RCTView)))')).toBe(true);
  });

  it('routes LAYOUT props to the wrapper and keeps them off the inner scroll view', () => {
    mount(ROOT_TAG, <App />);

    const inner = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(inner, 'inner RCTScrollView was created').toBeDefined();
    const wrapper = fabric.find(node => node.children.some(kid => kid === inner));
    expect(wrapper, 'a wrapper node wraps the inner RCTScrollView').toBeDefined();

    // `margin` is a pure-layout key: it drives the wrapper's frame and must NOT leak onto the inner.
    expect(wrapper!.props.margin).toBe(4);
    expect('margin' in inner!.props).toBe(false);
    // `height` is layout too: it sizes the laid-out box (the wrapper).
    expect(wrapper!.props.height).toBe(200);
  });

  it('routes VISUAL props to the inner scroll view and keeps them off the wrapper', () => {
    mount(ROOT_TAG, <App />);

    const inner = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(inner, 'inner RCTScrollView was created').toBeDefined();
    const wrapper = fabric.find(node => node.children.some(kid => kid === inner));
    expect(wrapper, 'a wrapper node wraps the inner RCTScrollView').toBeDefined();

    // backgroundColor and padding paint the scrolling content; they belong on the inner scroll view.
    expect(inner!.props.backgroundColor).toBe('#123');
    expect(inner!.props.padding).toBe(8);
    expect('backgroundColor' in wrapper!.props).toBe(false);
    expect('padding' in wrapper!.props).toBe(false);
  });

  it('leaves the inner scroll view with its vertical base and no hardcoded flex', () => {
    mount(ROOT_TAG, <App />);

    const inner = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(inner, 'inner RCTScrollView was created').toBeDefined();

    // The old INNER_FILL_STYLE forced flex:1 on the inner view; with height routed to the wrapper
    // the inner side has no flex at all.
    expect('flex' in inner!.props).toBe(false);
    // splitLayoutProps must not strip the base style the wrap composes under the visual props.
    expect(inner!.props.overflow).toBe('scroll');
    expect(inner!.props.flexDirection).toBe('column');
    // nestedScrollEnabled is the wrap's gesture wiring: the inner handles the scroll before refresh.
    expect(inner!.props.nestedScrollEnabled).toBe(true);
  });
});
