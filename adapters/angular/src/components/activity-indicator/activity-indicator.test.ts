import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { ActivityIndicator } from './index';

const ROOT_TAG = 905;
const fabric = installFabric();

let capturedHost: ActivityIndicatorHost | undefined;

function findCommitted(predicate: (node: IFakeNode) => boolean): IFakeNode | undefined {
  const visit = (node: IFakeNode): IFakeNode | undefined => {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const node of fabric.committed) {
    const found = visit(node);
    if (found) return found;
  }
  return undefined;
}

function findSpinner(): IFakeNode {
  const node = findCommitted(n => n.viewName === 'ActivityIndicatorView');
  if (!node) throw new Error('no ActivityIndicatorView was created');
  return node;
}

function findWrapper(): IFakeNode {
  const node = findCommitted(n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none');
  if (!node) throw new Error('no ActivityIndicator wrapper was created');
  return node;
}

@Component({
  selector: 'symbiote-activity-indicator-host',
  standalone: true,
  imports: [ActivityIndicator],
  template: `
    <ActivityIndicator
      [size]="size()"
      [color]="color()"
      [animating]="animating()"
      [testID]="testID()"
      [accessible]="true"
      [accessibilityLabel]="'loading'"
      (layout)="onLayout($event)"
    />
  `,
})
class ActivityIndicatorHost {
  readonly size = signal<'small' | 'large' | number>('large');
  readonly color = signal('#0000ff');
  readonly animating = signal(false);
  readonly testID = signal('spinner-wrapper');
  onLayout = vi.fn();

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

describe('ActivityIndicator', () => {
  it('renders through the shared descriptor shape and forwards wrapper props', async () => {
    mount(ROOT_TAG, ActivityIndicatorHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(fabric.serialize(fabric.appRoot().children)).toBe('RCTView(ActivityIndicatorView)');

    const spinner = findSpinner();
    expect(spinner.props.animating).toBe(false);
    expect(spinner.props.color).toBe('#0000ff');
    expect(spinner.props.hidesWhenStopped).toBe(true);
    expect(spinner.props.size).toBe('large');
    expect(spinner.props.width).toBe(36);
    expect(spinner.props.height).toBe(36);

    const wrapper = findWrapper();
    expect(wrapper.props.testID).toBe('spinner-wrapper');
    expect(wrapper.props.accessible).toBe(true);
    expect(wrapper.props.accessibilityLabel).toBe('loading');
    expect(wrapper.props.alignItems).toBe('center');
    expect(wrapper.props.justifyContent).toBe('center');

    fabric.fireEvent(wrapper.instanceHandle, 'topLayout', {});
    expect(capturedHost?.onLayout).toHaveBeenCalledOnce();
  });

  it('patches the descriptor without remounting the native wrapper', async () => {
    mount(ROOT_TAG, ActivityIndicatorHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const before = findWrapper();
    const createdBefore = fabric.counts.createNode;

    if (!capturedHost) throw new Error('host was not captured');
    capturedHost.size.set(48);
    capturedHost.color.set('#ff0000');
    capturedHost.animating.set(true);
    capturedHost.testID.set('spinner-wrapper-updated');
    await Promise.resolve();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const after = findWrapper();
    expect(after.instanceHandle).toBe(before.instanceHandle);
    expect(fabric.counts.createNode).toBe(createdBefore);
    expect(after.props.testID).toBe('spinner-wrapper-updated');
    const spinner = findSpinner();
    expect(spinner.props.color).toBe('#ff0000');
    expect(spinner.props.animating).toBe(true);
    expect(spinner.props.width).toBe(48);
    expect(spinner.props.height).toBe(48);
    // Updating from string size to numeric size sends null to reset the previous native enum.
    expect(spinner.props.size).toBeNull();
  });
});
