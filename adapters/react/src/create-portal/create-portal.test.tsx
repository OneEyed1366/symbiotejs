// Proves createPortal (create-portal.ts): content portals into an already-mounted host node
// OUTSIDE its own JSX position (same surface), and the guard rejects a target that isn't a real,
// mounted host node — the exact "don't let a dev corrupt the tree" case this exists to prevent.

import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPortal,
  mount,
  unmount,
  View,
  Text,
  type IHostInstance,
} from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 150;

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function findText(text: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTRawText' && node.props.text === text) found = node;
  });
  return found;
}

function App(): React.ReactElement {
  // A ref callback (not useRef) so setOverlay fires during commit and schedules the re-render
  // that resolves the portal target — a ref's `.current` is null for the whole FIRST render.
  const [overlay, setOverlay] = useState<IHostInstance | null>(null);
  return (
    <View>
      <Text testID="source">{overlay ? createPortal(<Text>ported in</Text>, overlay) : null}</Text>
      <View testID="overlay-host" ref={setOverlay} />
    </View>
  );
}

describe('createPortal', () => {
  it('renders content under the target node, not its own JSX position', () => {
    mount(ROOT_TAG, <App />);

    const ported = findText('ported in');
    expect(ported, '"ported in" text was committed').toBeDefined();

    const overlayHost = fabric.find(n => n.props.testID === 'overlay-host');
    expect(overlayHost, 'overlay host View was created').toBeDefined();
    if (overlayHost === undefined || ported === undefined) throw new Error('unreachable');

    const sourceText = fabric.find(n => n.props.testID === 'source');
    expect(sourceText, 'source Text was created').toBeDefined();
    if (sourceText === undefined) throw new Error('unreachable');

    // Walk from the FRESH committed tree (not the stale `created` handles) to confirm parentage.
    function isDescendantOf(root: IFakeNode, target: IFakeNode): boolean {
      if (root === target) return true;
      return root.children.some(child => isDescendantOf(child, target));
    }
    let overlayHostCommitted: IFakeNode | undefined;
    let sourceTextCommitted: IFakeNode | undefined;
    walk(fabric.committed, node => {
      if (node.tag === overlayHost.tag) overlayHostCommitted = node;
      if (node.tag === sourceText.tag) sourceTextCommitted = node;
    });
    expect(overlayHostCommitted).toBeDefined();
    expect(sourceTextCommitted).toBeDefined();
    if (overlayHostCommitted === undefined || sourceTextCommitted === undefined) {
      throw new Error('unreachable');
    }

    expect(
      isDescendantOf(overlayHostCommitted, ported),
      'portal landed under the overlay host',
    ).toBe(true);
    expect(
      isDescendantOf(sourceTextCommitted, ported),
      'portal did NOT stay under its own JSX <Text> parent',
    ).toBe(false);
  });

  it('throws a clear error for a non-host-node target instead of corrupting the tree', () => {
    // JSON.parse returns `any`, the honest way to hand createPortal a value TypeScript's own
    // signature would normally reject — exactly the "a JS consumer / bad ref" case being guarded.
    const plainObject = JSON.parse('{}');
    const selectorString = JSON.parse('"body"');
    expect(() => createPortal(<Text>x</Text>, plainObject)).toThrow(/already-mounted host node/);
    expect(() => createPortal(<Text>x</Text>, selectorString)).toThrow(/already-mounted host node/);
  });
});
