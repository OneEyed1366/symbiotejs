import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { el, txt, type IDescriptor } from '@symbiotejs/components';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../render';
import { DescriptorOutlet } from './index.ts';

const ROOT_TAG = 904;
const fabric = installFabric();

let capturedHost: DescriptorOutletHost | undefined;

async function flushAngular(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function currentOutletChild() {
  const child = fabric.appRoot().children[0];
  if (!child) throw new Error('descriptor outlet rendered no root child');
  return child;
}

@Component({
  selector: 'symbiote-descriptor-outlet-host',
  standalone: true,
  imports: [DescriptorOutlet],
  template: '<symbiote-descriptor-outlet [node]="node()" />',
})
class DescriptorOutletHost {
  readonly node = signal<IDescriptor>(
    el('symbiote-view', { testID: 'root', style: { width: 10 } }, [txt({}, ['hello'])]),
  );

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

describe('DescriptorOutlet', () => {
  it('renders a Descriptor tree through Renderer2', async () => {
    mount(ROOT_TAG, DescriptorOutletHost);
    await flushAngular();

    expect(fabric.serialize(fabric.appRoot().children)).toBe(
      'RCTView(RCTText(RCTRawText "hello"))',
    );
    const root = currentOutletChild();
    expect(root.props.testID).toBe('root');
    expect(root.props.width).toBe(10);
  });

  it('does not recommit a structurally identical descriptor through anchor flattening', async () => {
    mount(ROOT_TAG, DescriptorOutletHost);
    await flushAngular();

    const completeRootBefore = fabric.counts.completeRoot;

    capturedHost?.node.set(
      el('symbiote-view', { testID: 'root', style: { width: 10 } }, [txt({}, ['hello'])]),
    );
    await flushAngular();

    expect(fabric.counts.completeRoot).toBe(completeRootBefore);
  });

  it('patches same type/key descriptors without recreating the Fabric node', async () => {
    mount(ROOT_TAG, DescriptorOutletHost);
    await flushAngular();

    const before = currentOutletChild();
    const createdBefore = fabric.counts.createNode;

    capturedHost?.node.set(
      el('symbiote-view', { testID: 'root', style: { width: 20 } }, [txt({}, ['hello'])]),
    );
    await flushAngular();

    const after = currentOutletChild();
    expect(fabric.counts.createNode).toBe(createdBefore);
    expect(after.instanceHandle).toBe(before.instanceHandle);
    expect(after.props.width).toBe(20);
  });
});
