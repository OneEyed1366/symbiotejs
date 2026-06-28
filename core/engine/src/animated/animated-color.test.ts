// Co-located unit test (ADR 0025), ported from the headless `animated-color.smoke.tsx`.
// AnimatedColor: input forms parse to r/g/b/a channels, __getValue() is the rgba() string the
// commit color path expects, driving a channel re-pulls it, setValue fires listeners ONCE with
// the FINAL color and commits each bound leaf ONCE, and useNativeDriver mirrors a `color` node
// referencing the four channel tags. A fake native module records the native config.

import { beforeAll, describe, expect, it } from 'vitest';
import { AnimatedColor, AnimatedValue, AnimatedWithChildren } from '@symbiote/engine';

describe('AnimatedColor — input forms parse to channels', () => {
  it('parses a 6-digit hex', () => {
    expect(new AnimatedColor('#ff8800').__getValue()).toBe('rgba(255, 136, 0, 1)');
  });

  it('parses a 3-digit shorthand hex', () => {
    expect(new AnimatedColor('#f80').__getValue()).toBe('rgba(255, 136, 0, 1)');
  });

  it('parses an rgba() string', () => {
    expect(new AnimatedColor('rgba(10, 20, 30, 0.5)').__getValue()).toBe('rgba(10, 20, 30, 0.5)');
  });

  it('parses the rgba object form', () => {
    expect(new AnimatedColor({ r: 1, g: 2, b: 3, a: 1 }).__getValue()).toBe('rgba(1, 2, 3, 1)');
  });

  it('falls back to default black on an unparseable named color (never throws)', () => {
    expect(new AnimatedColor('rebeccapurple').__getValue()).toBe('rgba(0, 0, 0, 1)');
  });
});

describe('AnimatedColor — driving a channel re-pulls the string', () => {
  it('re-pulls the composed string when a channel value changes', () => {
    const red = new AnimatedValue(0);
    const color = new AnimatedColor({ r: red, g: 0, b: 0, a: 1 });
    expect(color.__getValue()).toBe('rgba(0, 0, 0, 1)');
    red.setValue(200);
    expect(color.__getValue()).toBe('rgba(200, 0, 0, 1)');
  });
});

// A minimal bound leaf: counting update() calls counts the view commits this color drives.
class CommitCountingLeaf extends AnimatedWithChildren {
  commits = 0;
  constructor(private readonly source: AnimatedColor) {
    super();
    source.__addChild(this);
  }
  update(): void {
    this.commits++;
    this.source.__getValue();
  }
}

describe('AnimatedColor — setValue fires once with the final color and commits once', () => {
  // AnimatedColor.setValue drives all four channels; without the _withSuspendedCallbacks guard,
  // one setValue would fire color listeners four times (each an intermediate rgba) and re-commit
  // each bound leaf four times.
  it('fires the listener exactly once with the final color and commits the leaf once', () => {
    const observed = new AnimatedColor({ r: 0, g: 0, b: 0, a: 1 });
    const leaf = new CommitCountingLeaf(observed);
    const fires: string[] = [];
    observed.addListener(state => {
      expect(typeof state.value).toBe('string');
      if (typeof state.value === 'string') fires.push(state.value);
    });

    observed.setValue({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(fires).toEqual(['rgba(10, 20, 30, 0.5)']);
    expect(leaf.commits).toBe(1);

    // A second setValue fires exactly once more (no leakage across calls).
    observed.setValue('#01020304');
    expect(fires).toHaveLength(2);
    expect(fires[1].startsWith('rgba(1, 2, 3,')).toBe(true);
    expect(leaf.commits).toBe(2);
  });
});

interface INativeCall {
  method: string;
  args: unknown[];
}

describe('AnimatedColor — native color node references the four channel tags', () => {
  const nativeCalls: INativeCall[] = [];

  function record(method: string): (...args: unknown[]) => void {
    return (...args: unknown[]) => {
      nativeCalls.push({ method, args });
    };
  }

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
  });

  it('creates a "color" animated node carrying numeric r/g/b/a channel tags', () => {
    const nativeColor = new AnimatedColor('#01020304');
    nativeColor.__makeNative();

    const colorCreate = nativeCalls.find(call => {
      const config = call.args[1];
      return (
        typeof config === 'object' && config !== null && 'type' in config && config.type === 'color'
      );
    });
    expect(colorCreate, 'a "color" animated node was created').toBeDefined();

    const colorConfig = colorCreate?.args[1];
    expect(typeof colorConfig === 'object' && colorConfig !== null).toBe(true);
    if (typeof colorConfig === 'object' && colorConfig !== null) {
      for (const channel of ['r', 'g', 'b', 'a']) {
        expect(typeof Reflect.get(colorConfig, channel)).toBe('number');
      }
    }
  });
});
