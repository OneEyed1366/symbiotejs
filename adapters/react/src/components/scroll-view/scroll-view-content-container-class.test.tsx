// Co-located React-driven test (ADR 0025): contentContainerStyle accepts a bare class-name
// string, resolved through the SAME shared style registry as `className` (routeProp's merge),
// not the full IClassNameValue union — see the widened IScrollViewProps type. Proves the
// resolved style lands on the CONTENT node (RCTScrollContentView), not the outer scroll view,
// and that a plain style object still works unchanged.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { View, mount, unmount } from '@symbiotejs/react';
import { installFabric } from '@symbiotejs/test-utils';
import { ScrollView } from './index';

const ROOT_TAG = 54;
const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('React ScrollView contentContainerStyle class-name resolution', () => {
  it('resolves a class-name string onto the content node', () => {
    registerStyles({ scrollContent: { padding: 8 } });
    mount(
      ROOT_TAG,
      <ScrollView contentContainerStyle="scrollContent">
        <View />
      </ScrollView>,
    );

    const content = fabric.find(node => node.viewName === 'RCTScrollContentView');
    expect(content, 'RCTScrollContentView was created').toBeDefined();
    expect(content!.props.padding).toBe(8);

    // The class must NOT leak onto the outer scroll view.
    const outer = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();
    expect('padding' in outer!.props).toBe(false);
  });

  it('still accepts a plain style object unchanged', () => {
    mount(
      ROOT_TAG,
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <View />
      </ScrollView>,
    );

    const content = fabric.find(node => node.viewName === 'RCTScrollContentView');
    expect(content!.props.padding).toBe(12);
  });
});
