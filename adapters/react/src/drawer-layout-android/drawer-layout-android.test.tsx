// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `drawer-layout-android.smoke`. Proves the DrawerLayoutAndroid primitive: the .android
// build commits an AndroidDrawerLayout host carrying drawerWidth/drawerPosition with the
// content wrapper FIRST and the navigation wrapper SECOND (RN's
// {childrenWrapper}{drawerViewWrapper} order); the imperative openDrawer()/closeDrawer()
// dispatch the matching view command to that host; and the base (off-Android) build
// degrades to a plain View whose open/close are no-ops. Per ADR 0019 the split is by
// filename, so each build is imported DIRECTLY, no Metro, no runtime Platform.OS toggle.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, Text, mount, unmount } from '@symbiote/react';
// The base barrel resolves DrawerLayoutAndroid to the off-Android fallback (index.ts).
import { DrawerLayoutAndroid as DrawerLayoutFallback } from '@symbiote/react';
import { DrawerLayoutAndroid, type IDrawerLayoutAndroidHandle } from './index.android';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

interface IDispatchedCommand {
  tag: number;
  command: string;
  args: readonly unknown[];
}

const ROOT_TAG = 210;

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
// open/close commands, so graft a recording `dispatchCommand` before any mount.
slot.dispatchCommand = (node, command, args) => {
  dispatched.push({ tag: nodeTag(node), command, args });
};

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

describe('React DrawerLayoutAndroid on the engine', () => {
  it('commits AndroidDrawerLayout(content, navigation) in that order with the host props', () => {
    mount(
      ROOT_TAG,
      <DrawerLayoutAndroid
        drawerWidth={300}
        drawerPosition="left"
        renderNavigationView={() => (
          <View>
            <Text>Menu</Text>
          </View>
        )}
      >
        <View>
          <Text>Content</Text>
        </View>
      </DrawerLayoutAndroid>,
    );

    expect(fabric.serialize(fabric.appRoot().children)).toBe(
      'AndroidDrawerLayout(RCTView(RCTView(RCTText(RCTRawText "Content")))RCTView(RCTView(RCTText(RCTRawText "Menu"))))',
    );

    const host = drawerNode();
    expect(host.props.drawerWidth).toBe(300);
    expect(host.props.drawerPosition).toBe('left');
    expect(host.children.length).toBe(2);
    // content wrapper FIRST: it carries the absolute full-screen mainSubview style.
    expect(host.children[0].props.position).toBe('absolute');
    expect(host.children[0].props.right).toBe(0);
    // navigation wrapper SECOND: drawerWidth-wide, default white background.
    expect(host.children[1].props.width).toBe(300);
    expect(host.children[1].props.backgroundColor).toBe('white');
  });

  it('dispatches openDrawer / closeDrawer commands to the host node via the ref', () => {
    let handle: IDrawerLayoutAndroidHandle | null = null;
    function ImperativeCase(): ReactElement {
      return (
        <DrawerLayoutAndroid
          ref={instance => {
            handle = instance;
          }}
          drawerWidth={250}
          renderNavigationView={() => <View />}
        >
          <View />
        </DrawerLayoutAndroid>
      );
    }
    mount(ROOT_TAG, <ImperativeCase />);

    expect(handle, 'imperative handle captured after commit').not.toBeNull();
    handle!.openDrawer();
    const openCmd = dispatched.find(d => d.command === 'openDrawer');
    expect(openCmd, "openDrawer() dispatched the 'openDrawer' command").toBeDefined();
    expect(openCmd!.tag).toBe(drawerNode().tag);

    handle!.closeDrawer();
    expect(dispatched.some(d => d.command === 'closeDrawer')).toBe(true);
  });

  it('degrades the base build to a plain View with no-op open/close', () => {
    let fallbackHandle: IDrawerLayoutAndroidHandle | null = null;
    function FallbackCase(): ReactElement {
      return (
        <DrawerLayoutFallback
          ref={instance => {
            fallbackHandle = instance;
          }}
          drawerWidth={250}
          renderNavigationView={() => <View />}
        >
          <View>
            <Text>Content</Text>
          </View>
        </DrawerLayoutFallback>
      );
    }
    mount(ROOT_TAG, <FallbackCase />);

    expect(fabric.find(n => n.viewName === 'AndroidDrawerLayout')).toBeUndefined();
    expect(fallbackHandle, 'fallback imperative handle captured').not.toBeNull();
    fallbackHandle!.openDrawer();
    fallbackHandle!.closeDrawer();
    expect(dispatched.length).toBe(0);
  });
});
