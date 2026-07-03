// Co-located React-driven test (ADR 0025), ported from `platform-color.smoke.tsx`.
// Proves PlatformColor / DynamicColorIOS reach the platform color processor. RN's
// processColor (wired via setColorProcessor) resolves CSS strings AND the opaque
// { semantic } / { dynamic } objects to the platform values iOS expects. The shared
// color seam (commit.ts processValue) once routed only strings, so an opaque color
// slipped past unprocessed; this asserts the object path flows through the processor
// and lands on the committed node.

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DynamicColorIOS,
  PlatformColor,
  View,
  mount,
  processColor,
  unmount,
} from '@symbiotejs/react';
import { isOpaqueColorValue, setColorProcessor } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

const STRING_SENTINEL = 0xff_00_00_ff;
const ROOT_TAG = 260;

// What the wired processor saw, proving the opaque style color reached it.
let seen: unknown[] = [];

function App(): ReactElement {
  return <View style={{ backgroundColor: PlatformColor('labelColor') }} />;
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  seen = [];
  // Mimic RN: an opaque color resolves to a native dict, a CSS string to an int.
  setColorProcessor(value => {
    seen.push(value);
    return isOpaqueColorValue(value) ? { native: value } : STRING_SENTINEL;
  });
});
afterEach(() => {
  unmount(ROOT_TAG);
  setColorProcessor(value => value);
});

describe('PlatformColor / DynamicColorIOS', () => {
  it('builds the opaque shapes iOS native reads', () => {
    expect(PlatformColor('systemBlue')).toEqual({ semantic: ['systemBlue'] });

    const dynamic = DynamicColorIOS({ light: '#ffffff', dark: '#000000' });
    expect(isOpaqueColorValue(dynamic)).toBe(true);
    expect(dynamic.dynamic?.light).toBe('#ffffff');
  });

  it('processColor delegates strings and opaque objects to the wired processor', () => {
    expect(processColor('#abcdef')).toBe(STRING_SENTINEL);

    const semantic = PlatformColor('systemBlue');
    expect(processColor(semantic)).toEqual({ native: semantic });
  });

  it('routes an opaque style color through the processor onto the committed node', () => {
    mount(ROOT_TAG, <App />);

    const painted = fabric.find(n => n.props.backgroundColor !== undefined);
    expect(painted, 'a node carries a backgroundColor').toBeDefined();

    // The committed prop is the processor's OUTPUT (the native dict), not the raw opaque object.
    expect(painted!.props.backgroundColor).toEqual({ native: { semantic: ['labelColor'] } });

    const routedSemantic = seen.some(
      v =>
        isOpaqueColorValue(v) && JSON.stringify(v) === JSON.stringify({ semantic: ['labelColor'] }),
    );
    expect(routedSemantic, 'the opaque style color reached the processor').toBe(true);
  });
});
