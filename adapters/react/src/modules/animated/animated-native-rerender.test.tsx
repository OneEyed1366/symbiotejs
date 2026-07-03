// Co-located regression test (ADR 0025), ported from the headless
// `animated-native-rerender.smoke.tsx`. Device bug "press any button -> the native pulse stops
// and never restarts": an unrelated re-render rebuilds the Animated.View's AnimatedProps leaf; if
// the swap detaches the old leaf BEFORE attaching the new one, the shared Value node momentarily
// reaches zero children, self-detaches, and drops its native animation node, killing the running
// native-driven loop. We mount a native-driven view, start a native animation on a Value, force a
// re-render (what a sibling button's setState does), and assert the Value's native node is NEVER
// dropped and its animation is never restarted.

import { type ReactElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSurface, setEventDispatcher, type IRootTag } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';
import reconciler, { withDiscretePriority } from '../../host-config';
import { LegacyRoot } from '../../reconciler-constants';
import { Animated } from './index';

interface INativeCall {
  method: string;
  args: unknown[];
}
const nativeCalls: INativeCall[] = [];

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args });
  };
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter(call => call.method === method);
}

installFabric();

const ROOT_TAG: IRootTag = 73;
const noop = (): void => {};

// The Value is owned outside render (a useRef in real code), so it is stable across re-renders.
// Only the Animated.View's props object is fresh each render. `tick` is the unrelated state a
// sibling button would bump; it changes nothing animated.
const opacity = new Animated.Value(0);

function App(props: { tick: number }): ReactElement {
  return <Animated.View style={{ opacity, marginTop: props.tick }} />;
}

let container: ReturnType<typeof reconciler.createContainer>;

function render(element: ReactElement): void {
  // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
  reconciler.updateContainerSync(element, container, null, noop);
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork();
}

let valueTag = -1;
let startsBefore = -1;
let startsAfter = -1;

beforeAll(() => {
  const fakeNativeAnimated = {
    createAnimatedNode(tag: number, config: unknown): void {
      nativeCalls.push({ method: 'createAnimatedNode', args: [tag, config] });
    },
    connectAnimatedNodes: record('connectAnimatedNodes'),
    disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
    connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
    disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
    restoreDefaultValues: record('restoreDefaultValues'),
    dropAnimatedNode: record('dropAnimatedNode'),
    startAnimatingNode: record('startAnimatingNode'),
    stopAnimation: record('stopAnimation'),
    setAnimatedNodeValue: record('setAnimatedNodeValue'),
    setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
    flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
    extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
    startListeningToAnimatedNodeValue: record('startListeningToAnimatedNodeValue'),
    stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
    getValue: record('getValue'),
    addAnimatedEventToView: record('addAnimatedEventToView'),
    removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
  };
  Object.assign(globalThis, {
    nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
  });

  setEventDispatcher(run => {
    withDiscretePriority(run);
    // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
    reconciler.flushSyncWork();
  });

  const surface = createSurface(ROOT_TAG);
  container = reconciler.createContainer(
    surface,
    LegacyRoot,
    null,
    false,
    null,
    'symbiote',
    noop,
    noop,
    noop,
    noop,
    null,
  );

  render(<App tick={0} />);

  Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

  const valueCreate = callsOf('createAnimatedNode').find(call => {
    const config = call.args[1];
    return (
      typeof config === 'object' && config !== null && 'type' in config && config.type === 'value'
    );
  });
  const tag = valueCreate?.args[0];
  valueTag = typeof tag === 'number' ? tag : -1;
  startsBefore = callsOf('startAnimatingNode').length;

  // A sibling button's setState: unrelated re-render, nothing animated changed.
  render(<App tick={8} />);
  startsAfter = callsOf('startAnimatingNode').length;
});

describe('native animation survives an unrelated re-render', () => {
  it('created a native value node and started it exactly once before the re-render', () => {
    expect(valueTag).toBeGreaterThan(-1);
    expect(startsBefore).toBe(1);
  });

  it('never drops the running Value node on an unrelated re-render', () => {
    const droppedValue = callsOf('dropAnimatedNode').some(call => call.args[0] === valueTag);
    expect(droppedValue).toBe(false);
  });

  it('never restarts the native animation on an unrelated re-render', () => {
    expect(startsAfter).toBe(startsBefore);
  });
});
