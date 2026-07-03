// A flat-bag `onX` responder callback is invoked by the engine's event dispatch, entirely
// outside Angular. In Angular 20 components compile as SignalView (not CheckAlways), so a plain
// state mutation inside such a callback dirties nothing and the template stays stale — the "pan
// does nothing" bug, while React/Vue repainted the same demo. SymbioteHostPropsDirective now
// calls `cdr.markForCheck()` after each such callback (flags the component + ancestors with
// RefreshView and notifies the scheduler), so the mutation repaints. This is the flat-root case;
// responder-nested-cd.test.ts covers the App→child nesting the real app has. See skill §17.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiotejs/test-utils';

import { mount, unmount } from '../render';
import { ViewHost as View, TextHost as Text, SymbioteHostPropsDirective } from '../primitives';

const ROOT_TAG = 970;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';

const fabric = installFabric();

// Fabric is clone-on-write: a prop update yields a NEW node object in the committed tree,
// never in `created`. Walk the live committed child-set for post-mutation assertions.
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

// The stable SymbioteNode (event target). Its identity and listener map survive clone-on-
// write, so firing on the first-created handle reaches the live listeners.
function handleFor(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'symbiote-responder-cd-host',
  standalone: true,
  imports: [View, Text, SymbioteHostPropsDirective],
  template: `
    <View [symbioteHostProps]="handlers"></View>
    <Text [symbioteHostProps]="statusProps">{{ status }}</Text>
  `,
})
class ResponderCdHost {
  status = 'idle';
  statusProps = { testID: 'status' };
  handlers = {
    testID: 'chip',
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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular responder callback triggers change detection', () => {
  it('re-renders bound state mutated inside a flat-bag responder callback', async () => {
    mount(ROOT_TAG, ResponderCdHost);
    await flush();
    expect(statusText('status')).toBe('idle');

    const chip = handleFor('chip');
    fabric.fireEvent(chip, TOUCH_START);
    await flush();
    expect(statusText('status')).toBe('granted');

    fabric.fireEvent(chip, TOUCH_MOVE);
    await flush();
    expect(statusText('status')).toBe('moving');

    fabric.fireEvent(chip, TOUCH_END);
    await flush();
    expect(statusText('status')).toBe('released');
  });
});
