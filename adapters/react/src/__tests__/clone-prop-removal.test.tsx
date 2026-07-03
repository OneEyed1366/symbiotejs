// Co-located React-driven test (ADR 0025), ported from `clone-prop-removal.smoke.tsx`.
// Regression for a clone-on-write bug only a Fabric-FAITHFUL slot reveals: real Fabric's
// `cloneNodeWithNewProps` MERGES the raw diff onto the node's existing props (a null value
// resets a prop), so a prop that simply disappears between commits keeps its stale value
// unless the engine explicitly sends it as null. This file keeps a PURPOSE-BUILT merge slot
// rather than the shared `installFabric()` harness, whose REPLACE semantics would hide the
// bug (a naive replace makes the test vacuously green, which is why the bug shipped).
// The engine's `diffProps` emits `{ opacity: null }` on release, so after the merge a
// Pressable whose pressed style sets opacity:0.2 fully drops opacity on release.

import { createElement, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Pressable, Text, View, mount, unmount } from '@symbiotejs/react';

interface IFakeNode {
  viewName: string;
  props: Record<string, unknown>;
  children: IFakeNode[];
  instanceHandle: unknown;
}

let committed: IFakeNode[] = [];
let eventHandler:
  ((handle: unknown, type: string, event: Record<string, unknown>) => void) | undefined;

// Fabric-faithful merge: raw props layer onto the node's current props; a null value
// resets that prop to its default (modelled here as removal).
function mergeProps(
  base: Record<string, unknown>,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(raw)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out;
}

const slot = {
  createNode: (
    _t: number,
    viewName: string,
    _r: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): IFakeNode => ({ viewName, props: { ...props }, children: [], instanceHandle }),
  cloneNodeWithNewProps: (node: IFakeNode, raw: Record<string, unknown>): IFakeNode => ({
    ...node,
    props: mergeProps(node.props, raw),
    children: [...node.children],
  }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (node: IFakeNode, raw: Record<string, unknown>): IFakeNode => ({
    ...node,
    props: mergeProps(node.props, raw),
    children: [],
  }),
  createChildSet: (): IFakeNode[] => [],
  appendChild: (parent: IFakeNode, child: IFakeNode): IFakeNode => {
    parent.children.push(child);
    return parent;
  },
  appendChildToSet: (childSet: IFakeNode[], child: IFakeNode): void => {
    childSet.push(child);
  },
  completeRoot: (_r: number, childSet: IFakeNode[]): void => {
    committed = childSet;
  },
  registerEventHandler: (
    handler: (handle: unknown, type: string, event: Record<string, unknown>) => void,
  ): void => {
    eventHandler = handler;
  },
  dispatchCommand: (): void => {},
};
Object.assign(globalThis, { nativeFabricUIManager: slot });

const TEST_ID = 'btn';
const ACTIVE_OPACITY = 0.2;
const ROOT_TAG = 310;

function App(): ReactElement {
  // onPress mounts a sibling subtree, mirroring "open a Modal on press", the case where
  // the bug showed up on device (the button stayed dim after the modal opened).
  const [open, setOpen] = useState(false);
  return createElement(
    View,
    null,
    createElement(
      Pressable,
      {
        testID: TEST_ID,
        onPress: () => setOpen(true),
        // pressed -> dim; released -> NO opacity key at all (TouchableOpacity's shape).
        style: ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: ACTIVE_OPACITY } : {}),
      },
      createElement(Text, null, 'tap'),
    ),
    open ? createElement(View, null, createElement(Text, null, 'opened')) : null,
  );
}

function findByTestId(nodes: IFakeNode[], id: string): IFakeNode | undefined {
  for (const node of nodes) {
    if (node.props.testID === id) return node;
    const found = findByTestId(node.children, id);
    if (found) return found;
  }
  return undefined;
}

beforeEach(() => {
  committed = [];
});
afterEach(() => unmount(ROOT_TAG));

describe('clone-on-write prop removal', () => {
  it('sets opacity on press and fully resets it on release', () => {
    mount(ROOT_TAG, createElement(App));

    expect(eventHandler, 'an event handler was registered').toBeDefined();
    const button = findByTestId(committed, TEST_ID);
    expect(button, 'the button is in the committed tree').toBeDefined();
    const handle = button!.instanceHandle;

    eventHandler!(handle, 'topTouchStart', {});
    expect(findByTestId(committed, TEST_ID)?.props.opacity).toBe(ACTIVE_OPACITY);

    eventHandler!(handle, 'topTouchEnd', {});
    // The whole point: opacity must be GONE (reset), not stuck at 0.2 after the merge.
    expect(findByTestId(committed, TEST_ID)?.props.opacity).toBeUndefined();
  });
});
