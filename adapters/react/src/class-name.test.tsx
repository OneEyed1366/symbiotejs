// Proves React's className prop (adapters/react/src/components.ts IViewProps/ITextProps)
// resolves through the SAME shared style registry every adapter's class/className/addClass
// funnels through (routeProp's centralized merge, core/engine/src/node.ts) — the point of
// centralizing it was that React needed zero renderer changes, only the prop type.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { mount, unmount, View } from '@symbiotejs/react';
import { installFabric } from '@symbiotejs/test-utils';

const ROOT_TAG = 909;
const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('React className prop', () => {
  it('resolves a registered class through the shared style registry', () => {
    registerStyles({ card: { padding: 10 } });
    mount(ROOT_TAG, <View testID="probe" className="card" />);

    const committed = fabric.find(node => node.props.testID === 'probe');
    expect(committed?.props.padding).toBe(10);
  });

  it('lets an explicit style prop win over the className-derived one', () => {
    registerStyles({ card: { padding: 10, backgroundColor: 'red' } });
    mount(ROOT_TAG, <View testID="probe" className="card" style={{ backgroundColor: 'blue' }} />);

    const committed = fabric.find(node => node.props.testID === 'probe');
    expect(committed?.props).toMatchObject({ padding: 10, backgroundColor: 'blue' });
  });
});
