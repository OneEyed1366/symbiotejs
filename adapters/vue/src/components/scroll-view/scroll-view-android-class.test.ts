// Regression guard for a real bug found converting examples/vue-sfc to the SFC style compiler:
// on Android, when a ScrollView carries BOTH a `class` attribute and a `refreshControl`, the
// class-derived LAYOUT style (flex/height/gap/…) never reached the AndroidSwipeRefreshLayout
// wrapper — only `:style` did — so the wrapper collapsed to nothing and the whole scroll content
// became invisible on a real device (iOS was unaffected, no such wrapper exists there). Root
// cause and fix: shared.ts's `layoutSplitStyle` (userStyle merged with the resolved `class`
// style) now feeds splitLayoutProps instead of userStyle alone. See the symbiote-sfc-style-
// compiler skill for the full incident. Explicit `.android` import: Vitest has no Metro-style
// platform-extension resolution, unlike the app build.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '../../render';
import { clearGlobalStyles, registerStyles } from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';
import { RefreshControl } from '../refresh-control';
import { ScrollView } from './index.android';

const ROOT_TAG = 512;
// @symbiote/components' component-names always resolves its iOS names under Vitest (no Metro
// platform resolution), so the wrapper's Fabric view name is 'PullToRefreshView' regardless of
// which platform ScrollView assemble file is under test.
const REFRESH_WRAPPER_VIEW = 'PullToRefreshView';

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function committedRefreshWrapper(): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === REFRESH_WRAPPER_VIEW) found = node;
  });
  expect(found, `a ${REFRESH_WRAPPER_VIEW} was committed`).toBeDefined();
  if (found === undefined) throw new Error('unreachable: refresh wrapper missing');
  return found;
}

describe('Android ScrollView + RefreshControl class/style split', () => {
  it('carries a class-derived layout prop onto the refresh wrapper, not just an explicit :style one', async () => {
    registerStyles({ grow: { flex: 1 } });
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            ScrollView,
            { class: 'grow', refreshControl: h(RefreshControl, { refreshing: false }) },
            { default: () => [h('symbiote-text')] },
          ),
      }),
    );
    await tick();
    expect(committedRefreshWrapper().props.flex).toBe(1);
  });

  it('still applies an explicit :style layout prop (no class) onto the wrapper — the pre-fix path', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            ScrollView,
            { style: { flex: 1 }, refreshControl: h(RefreshControl, { refreshing: false }) },
            { default: () => [h('symbiote-text')] },
          ),
      }),
    );
    await tick();
    expect(committedRefreshWrapper().props.flex).toBe(1);
  });

  it('merges class and :style layout props onto the wrapper, explicit :style winning on overlap', async () => {
    registerStyles({ grow: { flex: 1, height: 100 } });
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(
            ScrollView,
            {
              class: 'grow',
              style: { height: 200 },
              refreshControl: h(RefreshControl, { refreshing: false }),
            },
            { default: () => [h('symbiote-text')] },
          ),
      }),
    );
    await tick();
    const wrapper = committedRefreshWrapper();
    expect(wrapper.props.flex).toBe(1);
    expect(wrapper.props.height).toBe(200);
  });
});
