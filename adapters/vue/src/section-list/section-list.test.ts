// Co-located Vue-driven pipeline test (ADR 0025), the Vue twin of
// adapters/react/src/section-list/sticky-section-headers.test.tsx (plus the public SectionList
// surface). Proves SectionList over the shared section-flatten + VirtualizedList windowing: every
// section header and item renders, sticky section headers wrap each header in a transform-bearing
// collapsable:false wrapper (and none when disabled), and scrollToLocation maps
// (sectionIndex, itemIndex) onto the correct flat offset, landing as the native scrollTo command.
// Vue reactivity is async, so each driving step is followed by a macrotask `tick`.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SectionList, mount, unmount, type ISectionListHandle } from '@symbiote/vue';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

type ICommandCall = {
  name: string;
  args: readonly unknown[];
};

type IRow = { id: number; label: string };
type ISectionShape = { title: string; data: readonly IRow[] };

const ROOT_TAG = 340;
const ITEM_HEIGHT = 40;

const SECTIONS: ISectionShape[] = [
  {
    title: 'A',
    data: [
      { id: 0, label: 'row-a0' },
      { id: 1, label: 'row-a1' },
    ],
  },
  {
    title: 'B',
    data: [
      { id: 2, label: 'row-b0' },
      { id: 3, label: 'row-b1' },
    ],
  },
];

const commands: ICommandCall[] = [];

const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function collectTexts(): string[] {
  const texts: string[] = [];
  walk(fabric.committed, node => {
    const text = node.props.text;
    if (typeof text === 'string') texts.push(text);
  });
  return texts;
}

// A sticky-header wrapper is the only node carrying a `transform` (its translateY); regular cells
// and the content container do not. So transform-bearing nodes count the wrapped headers.
function stickyWrappers(): IFakeNode[] {
  return fabric.created.filter(n => Array.isArray(n.props.transform));
}

describe('Vue SectionList on the engine', () => {
  it('renders every section header and item', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(SectionList, {
            sections: SECTIONS,
            keyExtractor: (item: IRow) => `k-${item.id}`,
            renderSectionHeader: ({ section }: { section: ISectionShape }) =>
              h('symbiote-text', {}, `header:${section.title}`),
            renderItem: ({ item }: { item: IRow }) => h('symbiote-text', {}, item.label),
          }),
      }),
    );
    await tick();

    const texts = collectTexts();
    for (const want of ['header:A', 'row-a0', 'row-a1', 'header:B', 'row-b0', 'row-b1']) {
      expect(texts).toContain(want);
    }
  });

  it('wraps each section header in a collapsable:false sticky wrapper when enabled', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(SectionList, {
            sections: SECTIONS,
            stickySectionHeadersEnabled: true,
            renderSectionHeader: ({ section }: { section: ISectionShape }) =>
              h('symbiote-text', {}, section.title),
            renderItem: ({ item }: { item: IRow }) => h('symbiote-text', {}, `row-${item.id}`),
          }),
      }),
    );
    await tick();

    const wrappers = stickyWrappers();
    expect(wrappers.length, 'one sticky wrapper per section header').toBe(2);
    for (const wrapper of wrappers) {
      expect(wrapper.props.collapsable, 'sticky wrapper is collapsable:false').toBe(false);
    }
  });

  it('wraps nothing when stickySectionHeadersEnabled is false', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(SectionList, {
            sections: SECTIONS,
            stickySectionHeadersEnabled: false,
            renderSectionHeader: ({ section }: { section: ISectionShape }) =>
              h('symbiote-text', {}, section.title),
            renderItem: ({ item }: { item: IRow }) => h('symbiote-text', {}, `row-${item.id}`),
          }),
      }),
    );
    await tick();

    expect(stickyWrappers().length, 'disabled sticky headers wrap no header').toBe(0);
  });

  it('maps scrollToLocation onto the correct flat offset via scrollTo', async () => {
    const listRef = ref<ISectionListHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(SectionList, {
            ref: listRef,
            sections: SECTIONS,
            stickySectionHeadersEnabled: false,
            getItemLayout: (_data: unknown, index: number) => ({
              length: ITEM_HEIGHT,
              offset: ITEM_HEIGHT * index,
              index,
            }),
            renderSectionHeader: ({ section }: { section: ISectionShape }) =>
              h('symbiote-text', {}, `header:${section.title}`),
            renderItem: ({ item }: { item: IRow }) => h('symbiote-text', {}, item.label),
          }),
      }),
    );
    await tick();

    expect(listRef.value, 'SectionList handle attached').not.toBeNull();
    // Flattened (header + items + footer per section): section B's first item lands at flat
    // index 5 ([h:A,a0,a1,foot:A,h:B,b0,...]) -> offset 5 * ITEM_HEIGHT.
    listRef.value!.scrollToLocation({ sectionIndex: 1, itemIndex: 1, animated: true });
    const scrolls = commands.filter(c => c.name === 'scrollTo');
    expect(scrolls.length, 'one scrollTo from scrollToLocation').toBe(1);
    expect(scrolls[0].args[1]).toBe(5 * ITEM_HEIGHT);
    expect(scrolls[0].args[2]).toBe(true);
  });
});
