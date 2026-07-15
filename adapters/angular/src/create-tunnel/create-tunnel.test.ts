// Proves createTunnel (create-tunnel.ts) actually delivers across two GENUINELY separate,
// independently-mounted SymbioteSurfaces — the same proof React's/Vue's create-tunnel tests
// give, via two real `mount()` calls on different rootTags. Mirrors
// adapters/react/src/create-tunnel.test.tsx and adapters/vue/src/create-tunnel.test.ts.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ViewHost, TextHost } from '../primitives';
import { createTunnel, TunnelInDirective, TunnelOut } from './index';

const SOURCE_TAG = 920;
const TARGET_TAG = 921;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
};

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

describe('createTunnel (Angular) — genuine cross-surface delivery', () => {
  it('paints content registered by surface A on surface B, a DIFFERENT mounted surface', async () => {
    const tunnel = createTunnel();

    @Component({
      selector: 'symbiote-tunnel-source-app',
      standalone: true,
      imports: [TextHost, TunnelInDirective],
      template: '<Text *tunnelIn="tunnel">ported across surfaces</Text>',
    })
    class SourceApp {
      readonly tunnel = tunnel;
    }

    @Component({
      selector: 'symbiote-tunnel-target-app',
      standalone: true,
      imports: [ViewHost, TunnelOut],
      template: '<View><tunnel-out [tunnel]="tunnel" /></View>',
    })
    class TargetApp {
      readonly tunnel = tunnel;
    }

    // Surface A registers, fully independently, before surface B ever mounts.
    mount(SOURCE_TAG, SourceApp);
    // Surface B mounts SEPARATELY (its own rootTag, its own SymbioteSurface) and reads the
    // tunnel via its own TunnelOut — no ref, no rootTag lookup, no shared Fabric node at all.
    mount(TARGET_TAG, TargetApp);
    await settle();

    // fake-fabric's `committed` is last-write-wins across rootTags (core/test-utils
    // limitation, not the engine's), so after mounting B second it reflects B's own tree.
    expect(
      findText('ported across surfaces'),
      'content is present in the LAST-committed tree (surface B)',
    ).toBeDefined();
  });

  it('removes the content from the target once the source unmounts', async () => {
    const tunnel = createTunnel();

    @Component({
      selector: 'symbiote-tunnel-source-app-2',
      standalone: true,
      imports: [TextHost, TunnelInDirective],
      template: '<Text *tunnelIn="tunnel">still here</Text>',
    })
    class SourceApp {
      readonly tunnel = tunnel;
    }

    @Component({
      selector: 'symbiote-tunnel-target-app-2',
      standalone: true,
      imports: [ViewHost, TunnelOut],
      template: '<View><tunnel-out [tunnel]="tunnel" /></View>',
    })
    class TargetApp {
      readonly tunnel = tunnel;
    }

    mount(SOURCE_TAG, SourceApp);
    mount(TARGET_TAG, TargetApp);
    await settle();
    expect(findText('still here'), 'present while the source is mounted').toBeDefined();

    // Tearing down surface A destroys TunnelInDirective, whose ngOnDestroy unregisters from
    // the shared store; surface B's TunnelOut effect reacts on its own next tick and destroys
    // its view.
    unmount(SOURCE_TAG);
    await settle();
    expect(findText('still here'), 'gone from surface B after the source unmounts').toBeUndefined();
  });
});
