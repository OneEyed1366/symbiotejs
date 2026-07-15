// Proves createPortal (create-portal.ts) paints content into an already-mounted destination
// WITHIN THE SAME SURFACE — mirrors adapters/react/src/create-portal.test.tsx's "same surface,
// already-mounted target" case (Angular has no cross-surface equivalent of this primitive;
// createTunnel covers that, see create-tunnel.test.ts).

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ViewHost, TextHost } from '../primitives';
import { PortalDirective, PortalOutletDirective } from './index';

const ROOT_TAG = 930;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
};

let capturedHost: HostApp | undefined;

@Component({
  selector: 'symbiote-portal-host-app',
  standalone: true,
  imports: [ViewHost, TextHost, PortalDirective, PortalOutletDirective],
  template: `
    <View>
      <View portalOutlet #overlayHost="portalOutlet" testID="overlay-host"></View>
      @if (visible()) {
        <View *portal="overlayHost"><Text>portaled content</Text></View>
      }
    </View>
  `,
})
class HostApp {
  readonly visible = signal(false);

  constructor() {
    // Captures the live component instance so the test can drive its signals after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  capturedHost = undefined;
  fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

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

describe('createPortal (Angular) — same-surface delivery', () => {
  it('renders nothing until the portal is toggled on', async () => {
    mount(ROOT_TAG, HostApp);
    await settle();
    expect(findText('portaled content')).toBeUndefined();
  });

  it('paints content into the outlet once toggled on, and removes it once toggled off', async () => {
    mount(ROOT_TAG, HostApp);
    await settle();

    if (!capturedHost) throw new Error('host was not captured');
    capturedHost.visible.set(true);
    await settle();
    expect(findText('portaled content'), 'painted once the portal renders').toBeDefined();

    capturedHost.visible.set(false);
    await settle();
    expect(findText('portaled content'), 'gone once the portal unmounts').toBeUndefined();
  });
});
