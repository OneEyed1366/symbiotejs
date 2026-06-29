// Co-located Vue-driven pipeline test (ADR 0025), the Vue twin of
// adapters/react/src/virtualized-section-list/virtualized-section-list.test.tsx. Proves that
// VirtualizedSectionList flattens its sections into ONE windowed stream over VirtualizedList: the
// committed text stream is the flattened order (per section: header -> items -> footer), and
// scrollToLocation maps (sectionIndex, itemIndex) onto the correct flat offset, landing as the
// native scrollTo command. Vue reactivity is async, so each driving step is followed by a
// macrotask `tick`.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VirtualizedSectionList,
  mount,
  unmount,
  type IVirtualizedSectionListHandle,
} from '@symbiote/vue';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

type ICommandCall = {
  name: string;
  args: readonly unknown[];
};

type IRow = { id: number; label: string };
type ISectionShape = { title: string; data: readonly IRow[] };

const ROOT_TAG = 350;
const ITEM_HEIGHT = 40;
const VIEWPORT_HEIGHT = 400;

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

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'RCTScrollView was created').toBeDefined();
  if (node === undefined) throw new Error('unreachable: RCTScrollView missing');
  return node;
}

function sectionList(extra: Record<string, unknown>): ReturnType<typeof defineComponent> {
  return defineComponent({
    setup: () => () =>
      h(VirtualizedSectionList, {
        sections: SECTIONS,
        keyExtractor: (item: IRow) => `k-${item.id}`,
        renderSectionHeader: ({ section }: { section: ISectionShape }) =>
          h('symbiote-text', {}, `header:${section.title}`),
        renderSectionFooter: ({ section }: { section: ISectionShape }) =>
          h('symbiote-text', {}, `footer:${section.title}`),
        renderItem: ({ item }: { item: IRow }) => h('symbiote-text', {}, item.label),
        ...extra,
      }),
  });
}

async function mountWithViewport(extra: Record<string, unknown> = {}): Promise<void> {
  mount(ROOT_TAG, sectionList(extra));
  await tick();
  const scrollView = findScrollView();
  fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
  });
  await tick();
}

describe('Vue VirtualizedSectionList flattens sections into one windowed stream', () => {
  it('renders every section header, item, and footer', async () => {
    await mountWithViewport();
    const texts = collectTexts();
    for (const want of EXPECTED) {
      expect(texts).toContain(want);
    }
  });

  it('orders the flattened stream header -> items -> footer per section', async () => {
    await mountWithViewport();
    const relevant = collectTexts().filter(text => EXPECTED.includes(text));
    for (let index = 0; index < EXPECTED.length; index += 1) {
      expect(relevant[index]).toBe(EXPECTED[index]);
    }
  });

  it('maps scrollToLocation onto the correct flat offset via scrollTo', async () => {
    const listRef = ref<IVirtualizedSectionListHandle | null>(null);
    mount(
      ROOT_TAG,
      sectionList({
        ref: listRef,
        getItemLayout: (_data: unknown, index: number) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        }),
      }),
    );
    await tick();

    expect(listRef.value, 'handle attached').not.toBeNull();
    // Flattened [h:A,a0,a1,foot:A,h:B,b0,b1,foot:B]: section B's first item lands at flat index 5
    // -> offset 5 * ITEM_HEIGHT.
    listRef.value!.scrollToLocation({ sectionIndex: 1, itemIndex: 1, animated: false });
    const scrolls = commands.filter(c => c.name === 'scrollTo');
    expect(scrolls.length, 'one scrollTo from scrollToLocation').toBe(1);
    expect(scrolls[0].args[1]).toBe(5 * ITEM_HEIGHT);
    expect(scrolls[0].args[2]).toBe(false);
  });
});
