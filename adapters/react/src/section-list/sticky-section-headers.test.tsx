/** @jsxRuntime automatic */
// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `sticky-section-headers.smoke.tsx`. Proves that VirtualizedSectionList sticks its section
// headers. Stickiness is a JS layer (ScrollView wraps each flagged child in a
// ScrollViewStickyHeader, an Animated.View with collapsable:false and a translateY
// transform driven by the scroll offset; the native scroll view does NOT honor a bare index
// array). We mount two small sections (all entries inside the initial window) and assert the
// two section headers each get wrapped in a transform-bearing sticky wrapper, and that
// stickySectionHeadersEnabled={false} wraps nothing. This exercises the full
// VirtualizedSectionList -> ScrollView -> wrapStickyHeaders path.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedSectionList, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

interface IRow {
  id: number;
}

const ROOT_TAG = 43;
const SECTIONS = [
  { title: 'A', data: [{ id: 0 }, { id: 1 }] },
  { title: 'B', data: [{ id: 2 }, { id: 3 }] },
];

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// A sticky-header wrapper is the only node carrying a `transform` (its translateY); regular
// cells and the content container don't. So transform-bearing nodes count the wrapped headers.
function stickyWrappers(): IFakeNode[] {
  return fabric.created.filter(n => Array.isArray(n.props.transform));
}

function renderSection(props: {
  sections: typeof SECTIONS;
  stickySectionHeadersEnabled?: boolean;
}): ReactElement {
  return createElement(VirtualizedSectionList<IRow>, {
    sections: props.sections,
    stickySectionHeadersEnabled: props.stickySectionHeadersEnabled,
    renderSectionHeader: ({ section }) => createElement('symbiote-text', {}, section.title),
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
  });
}

describe('VirtualizedSectionList sticky section headers', () => {
  // Flattened: [0]=header A, [1..2]=items, [3]=footer A, [4]=header B, [5..6]=items,
  // [7]=footer B. No separators, no list header -> child positions equal entry indices,
  // so the two headers land at child 0 and 4 and get wrapped.
  it('wraps each of the two section headers in a collapsable:false sticky wrapper', () => {
    mount(ROOT_TAG, renderSection({ sections: SECTIONS }));
    const wrappers = stickyWrappers();
    expect(wrappers.length, 'one sticky wrapper per section header').toBe(2);
    for (const wrapper of wrappers) {
      expect(wrapper.props.collapsable, 'sticky wrapper is collapsable:false').toBe(false);
    }
  });

  it('wraps nothing when stickySectionHeadersEnabled is false', () => {
    mount(ROOT_TAG, renderSection({ sections: SECTIONS, stickySectionHeadersEnabled: false }));
    const wrappers = stickyWrappers();
    expect(wrappers.length, 'disabled sticky headers wrap no header').toBe(0);
  });
});
