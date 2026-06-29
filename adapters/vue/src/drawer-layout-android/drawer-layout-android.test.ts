// Co-located Vue-driven pipeline test (ADR 0025), the Vue twin of
// adapters/react/src/drawer-layout-android/drawer-layout-android.test.tsx. Proves the
// DrawerLayoutAndroid primitive: the .android build commits an AndroidDrawerLayout host carrying
// drawerWidth/drawerPosition with the content wrapper FIRST and the navigation wrapper SECOND
// (RN's {childrenWrapper}{drawerViewWrapper} order); the imperative openDrawer()/closeDrawer()
// dispatch the matching view command to that host (proving the shallowRef-held node resolves
// through the engine mirror); and the base (off-Android) build degrades to a plain View whose
// open/close are no-ops. Per ADR 0019 the split is by filename, so each build is imported
// DIRECTLY — content is the DEFAULT slot, navigation the `navigationView` slot. Vue reactivity is
// async, so each driving step is followed by a macrotask `tick`.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text, View, mount, unmount } from '@symbiote/vue';
// The base barrel resolves DrawerLayoutAndroid to the off-Android fallback (index.ts).
import { DrawerLayoutAndroid as DrawerLayoutFallback } from '@symbiote/vue';
import { DrawerLayoutAndroid, type IDrawerLayoutAndroidHandle } from './index.android';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

type IDispatchedCommand = {
  tag: number;
  command: string;
  args: readonly unknown[];
};

const ROOT_TAG = 360;
const DRAWER_WIDTH = 300;

const dispatched: IDispatchedCommand[] = [];

const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function nodeTag(node: unknown): number {
  if (isRecord(node) && typeof node.tag === 'number') return node.tag;
  throw new Error('dispatched node has no numeric tag');
}
// The shared harness slot doesn't record view commands; the imperative cases assert the
// open/close commands, so graft a recording dispatchCommand before any mount.
slot.dispatchCommand = (node, command, args) => {
  dispatched.push({ tag: nodeTag(node), command, args });
};

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  dispatched.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function drawerNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'AndroidDrawerLayout');
  if (!node) throw new Error('no AndroidDrawerLayout was created');
  return node;
}

describe('Vue DrawerLayoutAndroid on the engine', () => {
  it('commits AndroidDrawerLayout(content, navigation) in that order with the host props', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            DrawerLayoutAndroid,
            { drawerWidth: DRAWER_WIDTH, drawerPosition: 'left' },
            {
              default: () => [h(View, {}, () => [h(Text, {}, () => 'Content')])],
              navigationView: () => [h(View, {}, () => [h(Text, {}, () => 'Menu')])],
            },
          ),
      }),
    );
    await tick();

    expect(fabric.serialize(fabric.appRoot().children)).toBe(
      'AndroidDrawerLayout(RCTView(RCTView(RCTText(RCTRawText "Content")))RCTView(RCTView(RCTText(RCTRawText "Menu"))))',
    );

    const host = drawerNode();
    expect(host.props.drawerWidth).toBe(DRAWER_WIDTH);
    expect(host.props.drawerPosition).toBe('left');
    expect(host.children.length).toBe(2);
    // content wrapper FIRST: it carries the absolute full-screen mainSubview style.
    expect(host.children[0].props.position).toBe('absolute');
    expect(host.children[0].props.right).toBe(0);
    // navigation wrapper SECOND: drawerWidth-wide, default white background.
    expect(host.children[1].props.width).toBe(DRAWER_WIDTH);
    expect(host.children[1].props.backgroundColor).toBe('white');
  });

  it('dispatches openDrawer / closeDrawer commands to the host node via the ref', async () => {
    const handleRef = ref<IDrawerLayoutAndroidHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            DrawerLayoutAndroid,
            { ref: handleRef, drawerWidth: 250 },
            {
              default: () => [h(View, {})],
              navigationView: () => [h(View, {})],
            },
          ),
      }),
    );
    await tick();

    expect(handleRef.value, 'imperative handle captured after commit').not.toBeNull();
    handleRef.value!.openDrawer();
    const openCmd = dispatched.find(d => d.command === 'openDrawer');
    expect(openCmd, "openDrawer() dispatched the 'openDrawer' command").toBeDefined();
    expect(openCmd!.tag).toBe(drawerNode().tag);

    handleRef.value!.closeDrawer();
    expect(dispatched.some(d => d.command === 'closeDrawer')).toBe(true);
  });

  it('degrades the base build to a plain View with no-op open/close', async () => {
    const fallbackRef = ref<IDrawerLayoutAndroidHandle | null>(null);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            DrawerLayoutFallback,
            { ref: fallbackRef, drawerWidth: 250 },
            {
              default: () => [h(View, {}, () => [h(Text, {}, () => 'Content')])],
              navigationView: () => [h(View, {})],
            },
          ),
      }),
    );
    await tick();

    expect(fabric.find(n => n.viewName === 'AndroidDrawerLayout')).toBeUndefined();
    expect(fallbackRef.value, 'fallback imperative handle captured').not.toBeNull();
    fallbackRef.value!.openDrawer();
    fallbackRef.value!.closeDrawer();
    expect(dispatched.length).toBe(0);
  });
});
