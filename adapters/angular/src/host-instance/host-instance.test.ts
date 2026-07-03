// Co-located test for findNodeHandle (ADR 0025), the Angular twin of adapters/vue/src/host-instance/host-instance.test.ts.
// Proves the Angular adapter can resolve a raw engine node, an engine public instance, a bare
// reactTag, and null/undefined to a native tag using the engine's getNativeTag.

import { describe, expect, it } from 'vitest';
import { createElement, createSurface, getNativeTag } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';
import { findNodeHandle } from './index';

installFabric();
const ROOT_TAG = 708;

describe('Angular findNodeHandle on the engine', () => {
  it('returns the committed tag for a raw engine node', async () => {
    const surface = createSurface(ROOT_TAG);
    const node = createElement('RCTView');
    surface.appendChild(node);
    surface.commit();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const tag = getNativeTag(node);
    expect(tag).toBeGreaterThan(0);
    expect(findNodeHandle(node)).toBe(tag);
  });

  it('returns the committed tag for a public instance (toPublicInstance graft)', async () => {
    const surface = createSurface(ROOT_TAG + 1);
    const node = createElement('RCTView');
    surface.appendChild(node);
    surface.commit();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const tag = getNativeTag(node);
    // The public instance is the same identity as the engine node; findNodeHandle accepts it.
    const publicInstance = node;
    expect(findNodeHandle(publicInstance)).toBe(tag);
  });

  it('passes a bare number through idempotently', () => {
    expect(findNodeHandle(42)).toBe(42);
  });

  it('returns null for null, undefined, and unknown inputs', () => {
    expect(findNodeHandle(null)).toBeNull();
    expect(findNodeHandle(undefined)).toBeNull();
    expect(findNodeHandle('not-a-node' as any)).toBeNull();
    expect(findNodeHandle({} as any)).toBeNull();
  });
});
