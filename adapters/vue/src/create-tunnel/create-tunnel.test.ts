// Proves createTunnel (create-tunnel.ts) actually solves the case Teleport's scope
// explicitly does NOT cover: content registered by one surface painting on a GENUINELY
// different, independently-mounted SymbioteSurface — the concrete "system overlay lives in
// its own mount() call" scenario. Unlike the Teleport test (runtime-helpers.test.ts), there
// is no shared node/ref here at all — the two apps below never touch each other's Fabric
// tree directly, only a plain shared reactive Map.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTunnel, mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const SOURCE_TAG = 622;
const TARGET_TAG = 623;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(SOURCE_TAG);
  unmount(TARGET_TAG);
});

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function findText(text: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTRawText' && node.props.text === text) found = node;
  });
  return found;
}

describe('createTunnel — genuine cross-surface delivery', () => {
  it('paints content registered by surface A on surface B, a DIFFERENT mounted surface', async () => {
    const tunnel = createTunnel();

    const SourceApp = defineComponent({
      setup: () => () => h(tunnel.In, {}, () => h('symbiote-text', {}, 'ported across surfaces')),
    });
    const TargetApp = defineComponent({
      setup: () => () => h('symbiote-view', { testID: 'target' }, [h(tunnel.Out)]),
    });

    // Surface A registers content, fully synchronously, before surface B ever mounts.
    mount(SOURCE_TAG, SourceApp);
    await tick();
    // Surface B mounts SEPARATELY (its own rootTag, its own SymbioteSurface) and reads the
    // tunnel via <tunnel.Out/> on its OWN first render — no ref, no isSymbioteNode guard, no
    // rootTag lookup.
    mount(TARGET_TAG, TargetApp);
    await tick();

    // fake-fabric's `committed` is last-write-wins across rootTags (core/test-utils
    // limitation, not the engine's), so after mounting B second, it reflects B's own tree.
    const ported = findText('ported across surfaces');
    expect(ported, 'content is present in the LAST-committed tree (surface B)').toBeDefined();
  });

  it('removes the content from the target once the source unmounts', async () => {
    const tunnel = createTunnel();

    const SourceApp = defineComponent({
      setup: () => () => h(tunnel.In, {}, () => h('symbiote-text', {}, 'still here')),
    });
    const TargetApp = defineComponent({
      setup: () => () => h('symbiote-view', { testID: 'target' }, [h(tunnel.Out)]),
    });

    mount(SOURCE_TAG, SourceApp);
    await tick();
    mount(TARGET_TAG, TargetApp);
    await tick();
    expect(findText('still here'), 'present while the source is mounted').toBeDefined();

    // Tearing down surface A unmounts <tunnel.In>, whose onUnmounted drops it from the shared
    // Map — surface B's <tunnel.Out/> reacts to that Map mutation and recommits itself.
    unmount(SOURCE_TAG);
    await tick();
    expect(findText('still here'), 'gone from surface B after the source unmounts').toBeUndefined();
  });

  it('reacts to the slot content — updates propagate to an already-mounted target', async () => {
    const tunnel = createTunnel();
    const visible = ref(true);

    const SourceApp = defineComponent({
      setup: () => () =>
        h(tunnel.In, {}, () => (visible.value ? [h('symbiote-text', {}, 'toggle me')] : [])),
    });
    const TargetApp = defineComponent({
      setup: () => () => h('symbiote-view', { testID: 'target' }, [h(tunnel.Out)]),
    });

    mount(SOURCE_TAG, SourceApp);
    mount(TARGET_TAG, TargetApp);
    await tick();
    expect(findText('toggle me'), 'visible on first render').toBeDefined();

    visible.value = false;
    await tick();
    expect(
      findText('toggle me'),
      'gone after the source flips its own slot content',
    ).toBeUndefined();
  });
});
