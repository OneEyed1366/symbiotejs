// Co-located unit test (ADR 0025): the event layer. The shared fake Fabric captures the single
// handler the engine registers (fabric.fireEvent drives it); we assert press correlation,
// bubbling + stopPropagation, currentTarget/target tracking, direct layout delivery, and the
// ViewConfig gate that keeps a non-event onX as a prop.

import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiotejs/test-utils';
import {
  appendChild,
  createElement,
  routeProp,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '../index';
// installEventHandler is internal (surface.ts calls it); reach it directly so the test can drive
// the handler without standing up a surface.
import { installEventHandler } from './index';

const fabric = installFabric();
installEventHandler();

interface ITree {
  root: ISymbioteNode;
  button: ISymbioteNode;
  child: ISymbioteNode;
  sibling: ISymbioteNode;
}

function buildTree(): ITree {
  const root = createElement('RCTView');
  const button = createElement('RCTView');
  const child = createElement('RCTView');
  const sibling = createElement('RCTView');
  appendChild(root, button);
  appendChild(button, child);
  appendChild(root, sibling);
  return { root, button, child, sibling };
}

let tree: ITree;
beforeEach(() => {
  tree = buildTree();
});

describe('press correlation', () => {
  it('fires onPress when touch starts and ends on the target', () => {
    let presses = 0;
    routeProp(tree.button, 'onPress', () => {
      presses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.button, 'topTouchEnd');
    expect(presses).toBe(1);
  });

  it('fires onPress when touch ends on a descendant of the start target', () => {
    let presses = 0;
    routeProp(tree.button, 'onPress', () => {
      presses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.child, 'topTouchEnd');
    expect(presses).toBe(1);
  });

  it('does not fire onPress when touch ends on an unrelated sibling', () => {
    let presses = 0;
    routeProp(tree.button, 'onPress', () => {
      presses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.sibling, 'topTouchEnd');
    expect(presses).toBe(0);
  });

  it('topTouchCancel drops the pending press', () => {
    let presses = 0;
    routeProp(tree.button, 'onPress', () => {
      presses += 1;
    });
    fabric.fireEvent(tree.button, 'topTouchStart');
    fabric.fireEvent(tree.button, 'topTouchCancel');
    fabric.fireEvent(tree.button, 'topTouchEnd');
    expect(presses).toBe(0);
  });
});

describe('bubbling', () => {
  it('bubbles child -> parent without stopPropagation', () => {
    const order: string[] = [];
    routeProp(tree.button, 'onPress', () => order.push('parent'));
    routeProp(tree.child, 'onPress', () => order.push('child'));
    fabric.fireEvent(tree.child, 'topTouchStart');
    fabric.fireEvent(tree.child, 'topTouchEnd');
    expect(order).toEqual(['child', 'parent']);
  });

  it('stopPropagation at the child halts bubbling', () => {
    const order: string[] = [];
    routeProp(tree.button, 'onPress', () => order.push('parent'));
    routeProp(tree.child, 'onPress', (event: ISymbioteEvent) => {
      order.push('child');
      event.stopPropagation();
    });
    fabric.fireEvent(tree.child, 'topTouchStart');
    fabric.fireEvent(tree.child, 'topTouchEnd');
    expect(order).toEqual(['child']);
  });

  it('tracks currentTarget per listener while target stays the dispatch node', () => {
    let seen = 0;
    routeProp(tree.child, 'onPress', (event: ISymbioteEvent) => {
      if (event.target === tree.child && event.currentTarget === tree.child) seen += 1;
    });
    routeProp(tree.button, 'onPress', (event: ISymbioteEvent) => {
      if (event.target === tree.child && event.currentTarget === tree.button) seen += 1;
    });
    fabric.fireEvent(tree.child, 'topTouchStart');
    fabric.fireEvent(tree.child, 'topTouchEnd');
    expect(seen).toBe(2);
  });
});

describe('layout', () => {
  const frame = { x: 0, y: 0, width: 100, height: 40 };

  it('delivers layout directly to the target and raises the onLayout flag for Fabric', () => {
    let payload: unknown;
    routeProp(tree.sibling, 'onLayout', (event: ISymbioteEvent) => {
      payload = event.nativeEvent.layout;
    });
    // Fabric only emits layout when the node is flagged; a layout listener must raise onLayout.
    expect(tree.sibling.props.onLayout).toBe(true);
    fabric.fireEvent(tree.sibling, 'topLayout', { layout: frame });
    expect(payload).toBe(frame);
  });

  it('does not bubble layout to an ancestor', () => {
    let rootFired = false;
    routeProp(tree.sibling, 'onLayout', () => {});
    routeProp(tree.root, 'onLayout', () => {
      rootFired = true;
    });
    fabric.fireEvent(tree.sibling, 'topLayout', { layout: frame });
    expect(rootFired).toBe(false);
  });
});

describe('ViewConfig gate', () => {
  it('keeps an undeclared onX as a prop, not a listener', () => {
    routeProp(tree.sibling, 'onTintColor', '#34c759');
    expect(tree.sibling.props.onTintColor).toBe('#34c759');
    expect(tree.sibling.listeners?.has('tintColor')).not.toBe(true);
  });
});
