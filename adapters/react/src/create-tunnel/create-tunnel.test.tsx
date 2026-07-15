// Proves createTunnel (create-tunnel.tsx) actually solves the case createPortal's
// same-surface scope does NOT cover: content registered by one surface painting on a
// GENUINELY different, independently-mounted SymbioteSurface — the concrete "system
// overlay lives in its own mount() call" scenario. Unlike the portal test
// (create-portal.test.tsx), there is no shared node/ref here at all — the two apps below
// never touch each other's Fabric tree directly, only a plain shared store.

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTunnel, mount, unmount, Text, View } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const SOURCE_TAG = 610;
const TARGET_TAG = 611;

const fabric = installFabric();
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
  it('paints content registered by surface A on surface B, a DIFFERENT mounted surface', () => {
    const tunnel = createTunnel();

    function SourceApp(): React.ReactElement {
      return (
        <tunnel.In>
          <Text>ported across surfaces</Text>
        </tunnel.In>
      );
    }
    function TargetApp(): React.ReactElement {
      return (
        <View testID="target">
          <tunnel.Out />
        </View>
      );
    }

    // Surface A registers content, fully synchronously, before surface B ever mounts.
    mount(SOURCE_TAG, <SourceApp />);
    // Surface B mounts SEPARATELY (its own rootTag, its own SymbioteSurface) and reads the
    // tunnel on its OWN first render — no ref, no isSymbioteNode guard, no rootTag lookup.
    mount(TARGET_TAG, <TargetApp />);

    // fake-fabric's `committed` is last-write-wins across rootTags (core/test-utils
    // limitation, not the engine's), so after mounting B second, it reflects B's own tree.
    const ported = findText('ported across surfaces');
    expect(ported, 'content is present in the LAST-committed tree (surface B)').toBeDefined();
  });

  it('removes the content from the target once the source unmounts', () => {
    const tunnel = createTunnel();

    function SourceApp(): React.ReactElement {
      return (
        <tunnel.In>
          <Text>still here</Text>
        </tunnel.In>
      );
    }
    function TargetApp(): React.ReactElement {
      return (
        <View testID="target">
          <tunnel.Out />
        </View>
      );
    }

    mount(SOURCE_TAG, <SourceApp />);
    mount(TARGET_TAG, <TargetApp />);
    expect(findText('still here'), 'present while the source is mounted').toBeDefined();

    // Tearing down surface A unmounts <tunnel.In>, whose cleanup effect (items.delete +
    // notify) forces — via the SAME synchronous flush unmount() already does — a re-render
    // of surface B's <tunnel.Out />, now with the item gone.
    unmount(SOURCE_TAG);
    expect(findText('still here'), 'gone from surface B after the source unmounts').toBeUndefined();
  });

  it('exposes In/Out as components, not hooks — no ref/ISymbioteNode guard at all', () => {
    // Sanity check on the API shape itself: In takes plain children, not a host node
    // reference, so there is nothing here for isSymbioteNode to validate — the whole point
    // vs. createPortal/Teleport.
    const tunnel = createTunnel();
    expect(typeof tunnel.In).toBe('function');
    expect(typeof tunnel.Out).toBe('function');
  });

  it('does NOT loop when In and Out are children of the SAME component', () => {
    // Regression guard for the bug create-tunnel.tsx's header documents: an EARLIER
    // hook-based version (useTunnelIn/useTunnelOut called directly inside one component)
    // produced a genuine infinite render loop when both lived in the same component — a
    // silent white screen on device, no thrown error, since this custom renderer's
    // synchronous commit loop has no "Maximum update depth exceeded" guard. As separate
    // components, notify() only forces <tunnel.Out />'s own render scope, never <tunnel.In>'s
    // — even though both are children of this SameApp — so the cascade has nowhere to
    // bounce back to.
    //
    // The toggle is driven through a real native direct event (onLayout/topLayout, the same
    // dispatch path modal.test.tsx / switch.test.ts use for onRequestClose/onChange) rather
    // than calling a captured setState directly — a raw external setState dispatch isn't
    // guaranteed to flush synchronously outside the reconciler's own event-dispatch path.
    const tunnel = createTunnel();
    let renderCount = 0;

    function SameApp(): React.ReactElement {
      renderCount += 1;
      const [visible, setVisible] = useState(false);
      return (
        <View testID="root" onLayout={() => setVisible(true)}>
          {visible && (
            <tunnel.In>
              <Text>same-tree toast</Text>
            </tunnel.In>
          )}
          <tunnel.Out />
        </View>
      );
    }

    mount(SOURCE_TAG, <SameApp />);
    const rendersAfterMount = renderCount;
    expect(rendersAfterMount, 'settles quickly after mount, no runaway loop').toBeLessThan(5);

    const root = fabric.find(node => node.props.testID === 'root');
    expect(root, 'root View was created').toBeDefined();
    if (root === undefined) throw new Error('unreachable');
    fabric.fireEvent(root.instanceHandle, 'topLayout', {});

    expect(findText('same-tree toast'), 'the toggle actually reached Out').toBeDefined();
    expect(
      renderCount - rendersAfterMount,
      'settles again after the toggle, no runaway loop',
    ).toBeLessThan(5);
  });
});
