// Co-located unit test (ADR 0025): two-phase event delivery. The capture pass (root -> target)
// must fire each node's `<Event>Capture` listener BEFORE the bubble pass (target -> root),
// mirroring RN's accumulateTwoPhaseDispatches. The shared fake Fabric captures the engine's event
// handler (fabric.fireEvent drives it).

import { beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote/test-utils';
import { appendChild, createElement, type ISymbioteEvent, type ISymbioteNode } from '../index';
import { installEventHandler } from '../events';
// `change`/`changeCapture` is not a ViewConfig event for a bare RCTView, so routeProp would route
// them to props. The dispatch layer reads the raw listener keys, so register them through the
// low-level setter directly. The test drives dispatch ordering, not routeProp's ViewConfig gate.
import { setEventListener } from '../node';

const fabric = installFabric();
installEventHandler();

interface ITree {
  root: ISymbioteNode;
  parent: ISymbioteNode;
  child: ISymbioteNode;
}

function buildTree(): ITree {
  const root = createElement('RCTView');
  const parent = createElement('RCTView');
  const child = createElement('RCTView');
  appendChild(root, parent);
  appendChild(parent, child);
  return { root, parent, child };
}

let tree: ITree;
beforeEach(() => {
  tree = buildTree();
});

describe('two-phase delivery', () => {
  it('fires the full capture pass (root -> target) before the bubble pass (target -> root)', () => {
    const order: string[] = [];
    setEventListener(tree.root, 'changeCapture', () => order.push('root capture'));
    setEventListener(tree.parent, 'changeCapture', () => order.push('parent capture'));
    setEventListener(tree.child, 'change', () => order.push('child bubble'));
    setEventListener(tree.parent, 'change', () => order.push('parent bubble'));
    setEventListener(tree.root, 'change', () => order.push('root bubble'));

    fabric.fireEvent(tree.child, 'topChange');
    expect(order).toEqual([
      'root capture',
      'parent capture',
      'child bubble',
      'parent bubble',
      'root bubble',
    ]);
  });

  it("fires the target's own capture listener last in the capture pass", () => {
    const order: string[] = [];
    setEventListener(tree.root, 'changeCapture', () => order.push('root capture'));
    setEventListener(tree.parent, 'changeCapture', () => order.push('parent capture'));
    setEventListener(tree.child, 'changeCapture', () => order.push('child capture'));

    fabric.fireEvent(tree.child, 'topChange');
    expect(order[2]).toBe('child capture');
  });
});

describe('stopPropagation in capture', () => {
  it('halts before the bubble pass ever runs', () => {
    const seen: string[] = [];
    setEventListener(tree.parent, 'changeCapture', (event: ISymbioteEvent) => {
      seen.push('parent capture');
      event.stopPropagation();
    });
    setEventListener(tree.child, 'change', () => seen.push('child bubble'));

    fabric.fireEvent(tree.child, 'topChange');
    expect(seen).toEqual(['parent capture']);
  });
});

describe('currentTarget in capture', () => {
  it('tracks the capturing node while target stays the dispatch node', () => {
    const targets: string[] = [];
    setEventListener(tree.parent, 'changeCapture', (event: ISymbioteEvent) => {
      if (event.target === tree.child && event.currentTarget === tree.parent) targets.push('ok');
    });

    fabric.fireEvent(tree.child, 'topChange');
    expect(targets).toEqual(['ok']);
  });
});
