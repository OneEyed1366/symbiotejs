// Co-located React-driven test (ADR 0025), ported from `color-props.smoke.tsx`.
// Proves the COLOR_PROPS set runs every RN color style key through the injected platform
// processor before Fabric. Fabric's C++ color parser silently drops CSS strings, so a
// color key MUST reach the slot as a processed value (an int here), never the raw 'red'.
// A failure is a missing COLOR_PROPS entry (the logical/writing-direction keys that drifted).

import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, mount, unmount } from '@symbiotejs/react';
import { setColorProcessor } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

// A real RN processColor turns 'red' into a platform int; this sentinel int proves the
// key passed through processValue (COLOR_PROPS.has(key)) rather than reaching Fabric raw.
const PROCESSED_COLOR = 0xff_00_00_ff;
const ROOT_TAG = 250;

const COLOR_KEYS = [
  'borderStartColor',
  'borderEndColor',
  'borderBlockColor',
  'borderBlockStartColor',
  'borderBlockEndColor',
  'textShadowColor',
  'overlayColor',
  'outlineColor',
] as const;

function App(): ReactElement {
  const style: Record<string, unknown> = {};
  for (const key of COLOR_KEYS) style[key] = 'red';
  return <View style={style} />;
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  setColorProcessor(() => PROCESSED_COLOR);
});
afterEach(() => {
  unmount(ROOT_TAG);
  // Restore the identity processor so a sibling test sees an untouched seam.
  setColorProcessor(value => value);
});

describe('COLOR_PROPS processing', () => {
  it('runs every logical/writing-direction color key through the processor', () => {
    mount(ROOT_TAG, <App />);

    // The app's View is the RCTView carrying a color key, not the synthetic root.
    const view = fabric.find(n => n.viewName === 'RCTView' && COLOR_KEYS.some(k => k in n.props));
    expect(view, 'a styled RCTView was committed').toBeDefined();

    for (const key of COLOR_KEYS) {
      expect(view!.props[key], `"${key}" must not reach Fabric as the raw string`).not.toBe('red');
      expect(view!.props[key], `"${key}" must be the processed int`).toBe(PROCESSED_COLOR);
    }
  });
});
