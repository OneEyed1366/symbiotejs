// The device-faithful shape: a ROOT component whose template embeds a CHILD component that
// owns the responder state + the {{status}} binding (App -> ResponderDemo). Angular 20 compiles
// components as SignalView (not CheckAlways), so a plain (non-signal) state mutation inside a
// flat-bag responder callback does NOT dirty the child's reactive consumer, and the scheduler's
// root detectChanges() will NOT descend into it — the child's {{status}} used to stay stale
// ("pan does nothing"). SymbioteHostPropsDirective now refreshes its own host component's view
// right after the callback runs, so the nested child repaints.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ViewHost as View, TextHost as Text, SymbioteHostPropsDirective } from '../primitives';
import { registerComposedComponent } from '../anchor-host-registry';

const ROOT_TAG = 972;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';

registerComposedComponent('nested-responder-inner');

const fabric = installFabric();

function findCommitted(predicate: (node: IFakeNode) => boolean): IFakeNode | undefined {
  const stack = [...fabric.committed];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (predicate(node)) return node;
    stack.push(...node.children);
  }
  return undefined;
}

function statusText(testID: string): string | undefined {
  const node = findCommitted(n => n.props.testID === testID);
  const raw = node?.children[0];
  return typeof raw?.props.text === 'string' ? raw.props.text : undefined;
}

function handleFor(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'nested-responder-inner',
  standalone: true,
  imports: [View, Text, SymbioteHostPropsDirective],
  template: `
    <View [symbioteHostProps]="handlers"></View>
    <Text [symbioteHostProps]="statusProps">{{ status }}</Text>
  `,
})
class NestedResponderInner {
  status = 'idle';
  statusProps = { testID: 'nested-status' };
  handlers = {
    testID: 'nested-chip',
    onStartShouldSetResponder: () => true,
    onResponderGrant: () => {
      this.status = 'granted';
    },
    onResponderMove: () => {
      this.status = 'moving';
    },
    onResponderRelease: () => {
      this.status = 'released';
    },
  };
}

@Component({
  selector: 'nested-responder-outer',
  standalone: true,
  imports: [View, NestedResponderInner],
  template: `
    <View>
      <nested-responder-inner></nested-responder-inner>
    </View>
  `,
})
class NestedResponderOuter {}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular nested-child responder CD', () => {
  it('re-renders a nested child component`s state mutated in a flat-bag responder callback', async () => {
    mount(ROOT_TAG, NestedResponderOuter);
    await flush();
    expect(statusText('nested-status')).toBe('idle');

    const chip = handleFor('nested-chip');
    fabric.fireEvent(chip, TOUCH_START);
    await flush();
    expect(statusText('nested-status')).toBe('granted');

    fabric.fireEvent(chip, TOUCH_MOVE);
    await flush();
    expect(statusText('nested-status')).toBe('moving');

    fabric.fireEvent(chip, TOUCH_END);
    await flush();
    expect(statusText('nested-status')).toBe('released');
  });
});
