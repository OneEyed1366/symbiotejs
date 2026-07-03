import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiotejs/test-utils';
import { appendChild, createElement, createSurface, setProp } from '../index';

const ROOT_TAG = 613;

describe('Fabric family reparenting', () => {
  it('recreates a moved subtree instead of appending the old family under a new parent', () => {
    const fabric = installFabric();
    const surface = createSurface(ROOT_TAG);

    const sourceParent = createElement('RCTView');
    const targetParent = createElement('RCTView');
    const moved = createElement('RCTView');
    const movedChild = createElement('RCTView');

    setProp(moved, 'testID', 'moved');
    appendChild(moved, movedChild);
    appendChild(sourceParent, moved);
    surface.appendChild(sourceParent);
    surface.appendChild(targetParent);
    surface.commit();

    const firstMoved = fabric.find(node => node.props.testID === 'moved');
    expect(firstMoved).toBeDefined();

    fabric.reset();
    appendChild(targetParent, moved);

    expect(() => surface.commit()).not.toThrow();

    const secondMoved = fabric.find(node => node.props.testID === 'moved');
    expect(secondMoved).toBeDefined();
    expect(secondMoved).not.toBe(firstMoved);
    expect(secondMoved?.tag).not.toBe(firstMoved?.tag);
  });
});
