// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `responder-negotiation.smoke`. Proves the gesture-responder NEGOTIATION in the
// engine's events layer, driven over the fake Fabric slot with raw touch primitives:
// capture beats bubble, the grant/start/move/end/release lifecycle, a mid-gesture claim
// via onMoveShouldSetResponder, the transfer handoff (terminationRequest yes -> terminate
// +grant, no -> reject), LCA scoping, multi-touch end-vs-release, and transfer ordering.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, View } from '@symbiote/react';
import { installFabric } from '@symbiote/test-utils';

const ROOT_TAG = 160;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The stable SymbioteNode (event target) for the View created with this testID.
function handleFor(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no View created with testID=${testID}`);
  return node.instanceHandle;
}

describe('React responder negotiation', () => {
  it('lets capture beat bubble (capturing parent granted, child bubble never consulted)', () => {
    let parentCapture = 0;
    let parentGrant = 0;
    let childBubble = 0;
    let childGrant = 0;
    mount(
      ROOT_TAG,
      <View
        testID="cap-parent"
        onStartShouldSetResponderCapture={() => {
          parentCapture++;
          return true;
        }}
        onResponderGrant={() => {
          parentGrant++;
        }}
      >
        <View
          testID="cap-child"
          onStartShouldSetResponder={() => {
            childBubble++;
            return true;
          }}
          onResponderGrant={() => {
            childGrant++;
          }}
        />
      </View>,
    );

    fabric.fireEvent(handleFor('cap-child'), TOUCH_START);
    expect(parentCapture).toBe(1);
    expect(parentGrant).toBe(1);
    expect(childBubble).toBe(0);
    expect(childGrant).toBe(0);
    fabric.fireEvent(handleFor('cap-child'), TOUCH_END);
  });

  it('runs the grant / start / move / end / release lifecycle', () => {
    let grant = 0;
    let start = 0;
    let move = 0;
    let end = 0;
    let release = 0;
    mount(
      ROOT_TAG,
      <View
        testID="life"
        onStartShouldSetResponder={() => true}
        onResponderGrant={() => {
          grant++;
        }}
        onResponderStart={() => {
          start++;
        }}
        onResponderMove={() => {
          move++;
        }}
        onResponderEnd={() => {
          end++;
        }}
        onResponderRelease={() => {
          release++;
        }}
      />,
    );
    const h = handleFor('life');
    fabric.fireEvent(h, TOUCH_START);
    expect(grant).toBe(1);
    expect(start).toBe(1);
    fabric.fireEvent(h, TOUCH_MOVE);
    expect(move).toBe(1);
    fabric.fireEvent(h, TOUCH_END);
    expect(end).toBe(1);
    expect(release).toBe(1);
  });

  it('lets a node claim the responder mid-gesture via move-should-set', () => {
    let parentGrant = 0;
    let parentMove = 0;
    mount(
      ROOT_TAG,
      <View
        testID="move-parent"
        onMoveShouldSetResponder={() => true}
        onResponderGrant={() => {
          parentGrant++;
        }}
        onResponderMove={() => {
          parentMove++;
        }}
      >
        <View testID="move-child" />
      </View>,
    );
    const child = handleFor('move-child');
    fabric.fireEvent(child, TOUCH_START);
    expect(parentGrant).toBe(0);
    fabric.fireEvent(child, TOUCH_MOVE);
    expect(parentGrant).toBe(1);
    expect(parentMove).toBe(1);
    fabric.fireEvent(child, TOUCH_MOVE);
    expect(parentGrant).toBe(1);
    expect(parentMove).toBe(2);
    fabric.fireEvent(child, TOUCH_END);
  });

  it('hands over the responder when the incumbent consents to termination', () => {
    let childGrant = 0;
    let childTerminate = 0;
    let parentGrant = 0;
    mount(
      ROOT_TAG,
      <View
        testID="xfer-parent"
        onMoveShouldSetResponder={() => true}
        onResponderGrant={() => {
          parentGrant++;
        }}
      >
        <View
          testID="xfer-child"
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => {
            childGrant++;
          }}
          onResponderTerminationRequest={() => true}
          onResponderTerminate={() => {
            childTerminate++;
          }}
        />
      </View>,
    );
    const child = handleFor('xfer-child');
    fabric.fireEvent(child, TOUCH_START);
    expect(childGrant).toBe(1);
    fabric.fireEvent(child, TOUCH_MOVE);
    expect(childTerminate).toBe(1);
    expect(parentGrant).toBe(1);
    fabric.fireEvent(child, TOUCH_END);
  });

  it('rejects the taker when the incumbent refuses termination', () => {
    let childTerminate = 0;
    let parentGrant = 0;
    let parentReject = 0;
    mount(
      ROOT_TAG,
      <View
        testID="rej-parent"
        onMoveShouldSetResponder={() => true}
        onResponderGrant={() => {
          parentGrant++;
        }}
        onResponderReject={() => {
          parentReject++;
        }}
      >
        <View
          testID="rej-child"
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderTerminate={() => {
            childTerminate++;
          }}
        />
      </View>,
    );
    const child = handleFor('rej-child');
    fabric.fireEvent(child, TOUCH_START);
    fabric.fireEvent(child, TOUCH_MOVE);
    expect(childTerminate).toBe(0);
    expect(parentGrant).toBe(0);
    expect(parentReject).toBe(1);
    fabric.fireEvent(child, TOUCH_END);
  });

  it('scopes the move walk to the LCA so a node below the responder cannot steal it', () => {
    let parentGrant = 0;
    let parentMove = 0;
    let childMoveShouldSet = 0;
    let childGrant = 0;
    mount(
      ROOT_TAG,
      <View
        testID="lca-parent"
        onStartShouldSetResponder={() => true}
        onResponderGrant={() => {
          parentGrant++;
        }}
        onResponderMove={() => {
          parentMove++;
        }}
      >
        <View testID="lca-mid">
          <View
            testID="lca-child"
            onMoveShouldSetResponder={() => {
              childMoveShouldSet++;
              return true;
            }}
            onResponderGrant={() => {
              childGrant++;
            }}
          />
        </View>
      </View>,
    );
    const child = handleFor('lca-child');
    fabric.fireEvent(child, TOUCH_START);
    expect(parentGrant).toBe(1);
    fabric.fireEvent(child, TOUCH_MOVE);
    expect(childMoveShouldSet).toBe(0);
    expect(childGrant).toBe(0);
    expect(parentMove).toBe(1);
    fabric.fireEvent(child, TOUCH_END);
  });

  it('fires end (not release) when one of multiple touches lifts, releasing on the last', () => {
    let grant = 0;
    let end = 0;
    let release = 0;
    mount(
      ROOT_TAG,
      <View
        testID="multi"
        onStartShouldSetResponder={() => true}
        onResponderGrant={() => {
          grant++;
        }}
        onResponderEnd={() => {
          end++;
        }}
        onResponderRelease={() => {
          release++;
        }}
      />,
    );
    const h = handleFor('multi');
    fabric.fireEvent(h, TOUCH_START);
    fabric.fireEvent(h, TOUCH_START);
    expect(grant).toBe(1);
    // Lift the first finger; the second is still down with its target on the responder.
    fabric.fireEvent(h, TOUCH_END, { touches: [{ target: h }] });
    expect(end).toBe(1);
    expect(release).toBe(0);
    // Lift the last finger; no touches remain -> release.
    fabric.fireEvent(h, TOUCH_END, { touches: [] });
    expect(end).toBe(2);
    expect(release).toBe(1);
  });

  it('grants the taker before terminating the incumbent on a consented transfer', () => {
    const order: string[] = [];
    mount(
      ROOT_TAG,
      <View
        testID="ord-parent"
        onMoveShouldSetResponder={() => true}
        onResponderGrant={() => {
          order.push('grant');
        }}
      >
        <View
          testID="ord-child"
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => true}
          onResponderTerminate={() => {
            order.push('terminate');
          }}
        />
      </View>,
    );
    const child = handleFor('ord-child');
    fabric.fireEvent(child, TOUCH_START);
    fabric.fireEvent(child, TOUCH_MOVE);
    expect(order.join(',')).toBe('grant,terminate');
    fabric.fireEvent(child, TOUCH_END);
  });
});
