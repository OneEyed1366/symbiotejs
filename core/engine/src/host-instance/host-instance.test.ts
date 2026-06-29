// Co-located unit test (ADR 0025) for toPublicInstance, the framework-agnostic graft every
// adapter applies to its host nodes. Proves it attaches the six imperative methods onto the
// retained node, returns the SAME node identity (it mutates in place, so the engine commit
// mirror keyed on the raw node still resolves it), and is idempotent across repeated calls.
// setNativeProps is driven end to end through the public instance to prove the grafted method
// reaches the engine's clone-on-write commit and lands the prop on the committed view.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createElement,
  createSurface,
  toPublicInstance,
  type ISymbioteNode,
} from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 77;
const METHOD_NAMES = [
  'measure',
  'measureInWindow',
  'measureLayout',
  'setNativeProps',
  'focus',
  'blur',
] as const;

const fabric = installFabric();

function methodOf(node: ISymbioteNode, name: string): unknown {
  return Reflect.get(node, name);
}

function appView(): IFakeNode {
  return fabric.appRoot().children[0];
}

beforeEach(() => fabric.reset());

describe('toPublicInstance', () => {
  it('grafts the six imperative methods onto the retained node', () => {
    const instance = toPublicInstance(createElement('RCTView'));
    for (const name of METHOD_NAMES) {
      expect(typeof methodOf(instance, name), `${name} is a function`).toBe('function');
    }
  });

  it('returns the SAME node identity, mutated in place', () => {
    const node = createElement('RCTView');
    expect(toPublicInstance(node)).toBe(node);
  });

  it('is idempotent: a second call returns the same instance with the same methods', () => {
    const first = toPublicInstance(createElement('RCTView'));
    const measureBefore = methodOf(first, 'measure');
    const second = toPublicInstance(first);
    expect(second).toBe(first);
    expect(methodOf(second, 'measure')).toBe(measureBefore);
  });

  it('drives setNativeProps through the public instance onto the committed view', () => {
    const surface = createSurface(ROOT_TAG);
    const instance = toPublicInstance(createElement('RCTView'));
    surface.appendChild(instance);
    surface.commit();

    instance.setNativeProps({ nativeID: 'grafted' });

    expect(appView().props.nativeID).toBe('grafted');
  });
});
