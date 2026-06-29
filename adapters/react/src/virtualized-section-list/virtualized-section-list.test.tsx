/** @jsxRuntime automatic */
// Co-located React-driven test (ADR 0025), ported from the headless `smoke.tsx`. Proves that
// VirtualizedSectionList flattens sections into one windowed stream. The fake
// nativeFabricUIManager records every committed node, so we mount two sections, give the list
// a viewport via a topLayout event, and assert the flattened order: section-0 header -> its
// items -> footer, then section-1 header -> items -> footer. The whole stream goes through
// VirtualizedList's windowing, so a failure here is in JS, not the simulator.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedSectionList, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 33;
const VIEWPORT_HEIGHT = 400;

interface IRow {
  id: number;
  label: string;
}

interface ISectionShape {
  title: string;
  data: readonly IRow[];
}

const SECTIONS: ISectionShape[] = [
  {
    title: 'Section A',
    data: [
      { id: 0, label: 'row-a0' },
      { id: 1, label: 'row-a1' },
    ],
  },
  {
    title: 'Section B',
    data: [
      { id: 2, label: 'row-b0' },
      { id: 3, label: 'row-b1' },
    ],
  },
];

function App(): ReactElement {
  return createElement(VirtualizedSectionList<IRow>, {
    sections: SECTIONS,
    keyExtractor: (item: IRow) => `k-${item.id}`,
    renderSectionHeader: ({ section }: { section: ISectionShape }) =>
      createElement('symbiote-text', {}, `header:${section.title}`),
    renderSectionFooter: ({ section }: { section: ISectionShape }) =>
      createElement('symbiote-text', {}, `footer:${section.title}`),
    renderItem: ({ item }: { item: IRow }) => createElement('symbiote-text', {}, item.label),
  });
}

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const EXPECTED = [
  'header:Section A',
  'row-a0',
  'row-a1',
  'footer:Section A',
  'header:Section B',
  'row-b0',
  'row-b1',
  'footer:Section B',
];

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

// The committed text stream, in document order: exactly the flattened entry sequence.
function collectTexts(): string[] {
  const texts: string[] = [];
  walk(fabric.committed, node => {
    const text = node.props.text;
    if (typeof text === 'string') texts.push(text);
  });
  return texts;
}

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'RCTScrollView was created').toBeDefined();
  if (node === undefined) throw new Error('unreachable: RCTScrollView missing');
  return node;
}

// Establish the viewport by firing onLayout on the ScrollView. This re-renders and re-commits
// synchronously, narrowing the window from the initial bounded prefix to the real visible
// region. With only 8 entries the whole stream fits.
function mountWithViewport(): void {
  mount(ROOT_TAG, <App />);
  const scrollView = findScrollView();
  fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
  });
}

describe('VirtualizedSectionList flattens sections into one windowed stream', () => {
  it('renders every section header, item, and footer', () => {
    mountWithViewport();
    const texts = collectTexts();
    for (const want of EXPECTED) {
      expect(texts).toContain(want);
    }
  });

  it('orders the flattened stream header -> items -> footer per section', () => {
    mountWithViewport();
    const texts = collectTexts();
    // Filter to the entries we care about and compare positionally so an out-of-order footer
    // or a misrouted item is caught.
    const relevant = texts.filter(text => EXPECTED.includes(text));
    for (let index = 0; index < EXPECTED.length; index += 1) {
      expect(relevant[index]).toBe(EXPECTED[index]);
    }
  });
});
