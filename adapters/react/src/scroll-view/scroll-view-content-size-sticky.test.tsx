// Co-located test (ADR 0025), ported from the headless smoke. Proves two ScrollView gaps
// closed in JS (no native support needed):
//   1. onContentSizeChange, synthesized from an onLayout on the inner content node
//      (RN ScrollView.js _handleContentOnLayout). Fires (width, height) only when the size
//      actually changed (dedupe).
//   2. stickyHeaderIndices: RN implements stickiness PURELY IN JS by wrapping each flagged
//      child in a sticky-header component fed by the scroll offset; the native scroll view
//      ignores the index array. We assert the flagged child is wrapped, and that each sticky
//      header is fed the NEXT flagged header's y (nextHeaderLayoutY cross-talk).

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, Text, mount, unmount } from '@symbiote/react';
import { ScrollView } from './index';
import { ScrollViewStickyHeader, type IStickyHeaderComponentProps } from './sticky-header';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 53;

// Recorders owned by the apps below; reset per test after fabric.reset().
const contentSizes: Array<[number, number]> = [];
// Latest nextHeaderLayoutY each header was rendered with, keyed by its text content. The spy
// overwrites on every render, so after the layout round-trips this holds the resolved value.
const nextYByHeader = new Map<string, number | undefined>();

function App(): ReactElement {
  return (
    <ScrollView
      onContentSizeChange={(width, height) => {
        contentSizes.push([width, height]);
      }}
      stickyHeaderIndices={[0]}
    >
      <Text>Sticky header</Text>
      <View />
    </ScrollView>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function subtreeContains(node: IFakeNode, target: IFakeNode): boolean {
  if (node === target) return true;
  return node.children.some(child => subtreeContains(child, target));
}

function headerText(children: IStickyHeaderComponentProps['children']): string {
  // Each header's child is a <Text>label</Text>; pull the label so we can tell H0 from H1.
  if (!isRecord(children)) return '';
  const props = Reflect.get(children, 'props');
  if (!isRecord(props)) return '';
  const inner = Reflect.get(props, 'children');
  return typeof inner === 'string' ? inner : '';
}

// Spy wrapper: records the nextHeaderLayoutY it is handed, then delegates to the real header so
// the genuine onLayout recorder (which reports this header's own y up to the parent) still runs.
function SpyStickyHeader(props: IStickyHeaderComponentProps): ReactElement {
  nextYByHeader.set(headerText(props.children), props.nextHeaderLayoutY);
  return createElement(ScrollViewStickyHeader, props);
}

function StickyApp(): ReactElement {
  return (
    <ScrollView stickyHeaderIndices={[0, 2]} StickyHeaderComponent={SpyStickyHeader}>
      <Text>H0</Text>
      <View />
      <Text>H1</Text>
      <View />
    </ScrollView>
  );
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  contentSizes.length = 0;
  nextYByHeader.clear();
});
afterEach(() => unmount(ROOT_TAG));

describe('ScrollView content-size + sticky headers', () => {
  it('synthesizes onContentSizeChange from the content onLayout and dedupes', () => {
    mount(ROOT_TAG, <App />);

    // The synthesizer puts an onLayout on the content node, so Fabric raises the onLayout flag.
    const content = fabric.find(node => node.viewName === 'RCTScrollContentView');
    expect(content, 'RCTScrollContentView was created').toBeDefined();
    expect(content!.props.onLayout).toBe(true);

    // Fire a layout at the content node -> onContentSizeChange(width, height) fires once.
    fabric.fireEvent(content!.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: 800 },
    });
    expect(contentSizes.length).toBe(1);
    expect(contentSizes[0][0]).toBe(320);
    expect(contentSizes[0][1]).toBe(800);

    // Same size again -> deduped, no second call (RN's behavior).
    fabric.fireEvent(content!.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: 800 },
    });
    expect(contentSizes.length).toBe(1);

    // Size changed -> fires again.
    fabric.fireEvent(content!.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: 1200 },
    });
    expect(contentSizes.length).toBe(2);
    expect(contentSizes[1][1]).toBe(1200);
  });

  it('wraps the flagged sticky child and sets a scrollEventThrottle', () => {
    mount(ROOT_TAG, <App />);

    const content = fabric.find(node => node.viewName === 'RCTScrollContentView');
    expect(content, 'RCTScrollContentView was created').toBeDefined();

    const text = fabric.find(
      node => node.viewName === 'RCTText' || node.viewName === 'RCTParagraph',
    );
    expect(text, 'a Text node was created').toBeDefined();

    // The Text must NOT be a direct child of the content node. It sits inside the sticky wrapper.
    expect(content!.children.includes(text!)).toBe(false);
    // The wrapper is the content child whose subtree contains the Text.
    const wrapper = content!.children.find(child => subtreeContains(child, text!));
    expect(wrapper, 'a sticky wrapper wraps the flagged child').toBeDefined();
    // The wrapper is a real (non-flattened) view carrying a transform: the sticky translateY.
    expect(wrapper!.props.collapsable).toBe(false);
    const transform = wrapper!.props.transform;
    expect(Array.isArray(transform)).toBe(true);
    expect(
      Array.isArray(transform) && transform.some(entry => isRecord(entry) && 'translateY' in entry),
    ).toBe(true);

    // The second child (the plain View at index 1) is NOT flagged, so it stays unwrapped.
    const plainView = content!.children.find(
      child => child !== wrapper && child.viewName === 'RCTView',
    );
    expect(plainView, 'the non-sticky child stays an unwrapped direct content child').toBeDefined();

    // onScroll is wired on the scroll view so the sticky AnimatedValue tracks the offset.
    const outer = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();
    expect(typeof outer!.props.scrollEventThrottle).toBe('number');
  });

  it('feeds the earlier sticky header the next header y by index order', () => {
    // RN feeds each sticky header the y of the NEXT flagged header (_onStickyHeaderLayout ->
    // previousHeader.setNextHeaderY): that y is the push-off collision point. With TWO sticky
    // headers, the EARLIER header must receive the LATER header's y, while the LAST stays undefined.
    mount(ROOT_TAG, <StickyApp />);

    // Before any layout: neither header knows the next one's y.
    expect(nextYByHeader.get('H0')).toBeUndefined();

    // The two sticky wrappers are the transform-bearing Animated.View nodes, in document order:
    // [0] = H0, [1] = H1. Fire a real topLayout at each via the registered event handler.
    const stickyWrappers = fabric.created.filter(
      node => Array.isArray(node.props.transform) && node.props.collapsable === false,
    );
    expect(stickyWrappers.length).toBe(2);

    // Measure H1 first (y=100), then H0 (y=0): the recorder must feed H1's y to H0 by index order,
    // not arrival order (RN keys _headerLayoutYs by child key, not by which fires first).
    fabric.fireEvent(stickyWrappers[1].instanceHandle, 'topLayout', {
      layout: { x: 0, y: 100, width: 320, height: 40 },
    });
    fabric.fireEvent(stickyWrappers[0].instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: 40 },
    });

    // H0 (earlier) must learn H1's y as its push-off collision point; H1 (last) stays undefined.
    expect(nextYByHeader.get('H0')).toBe(100);
    expect(nextYByHeader.get('H1')).toBeUndefined();
  });
});
