// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `responder.smoke`. Proves the responder system end-to-end: a View carrying
// PanResponder's panHandlers, driven through the REAL event layer
// (topTouchStart/Move/End on the node's instanceHandle, exactly how Fabric delivers
// touches). The negotiation grants the responder, routes a move with the correct
// gestureState deltas, and releases on end, the path a device drag exercises.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, View, PanResponder } from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';

const ROOT_TAG = 150;

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// One finger: touches carry pageX/pageY/timestamp, the shape PanResponder reads for
// centroid + velocity.
function touch(
  pageX: number,
  pageY: number,
  timestamp: number,
  target: number,
): Record<string, unknown> {
  const point = { pageX, pageY, locationX: pageX, locationY: pageY, identifier: 1, timestamp };
  return { touches: [point], changedTouches: [point], target, timestamp };
}

describe('React responder system through the event layer', () => {
  it('grants, routes a move with dx/dy from the grant point, and releases', () => {
    const seen: string[] = [];
    let moveDx = 0;
    let moveDy = 0;
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        seen.push('grant');
      },
      onPanResponderMove: (_event, gesture) => {
        seen.push('move');
        moveDx = gesture.dx;
        moveDy = gesture.dy;
      },
      onPanResponderRelease: () => {
        seen.push('release');
      },
    });

    function App(): ReactElement {
      return <View {...responder.panHandlers} style={{ width: 50, height: 50 }} />;
    }

    mount(ROOT_TAG, <App />);

    const viewNode = fabric.appRoot().children[0];
    expect(viewNode, 'PanResponder View was committed').toBeDefined();
    const handle = viewNode.instanceHandle;
    const tag = viewNode.tag;

    // One finger: down at (10,10), drag to (40,55), lift.
    fabric.fireEvent(handle, 'topTouchStart', touch(10, 10, 1_000, tag));
    fabric.fireEvent(handle, 'topTouchMove', touch(40, 55, 1_016, tag));
    fabric.fireEvent(handle, 'topTouchEnd', touch(40, 55, 1_032, tag));

    expect(seen.join(',')).toBe('grant,move,release');
    // dx/dy are the delta from the grant point: 40-10=30, 55-10=45.
    expect(moveDx).toBe(30);
    expect(moveDy).toBe(45);
  });
});
