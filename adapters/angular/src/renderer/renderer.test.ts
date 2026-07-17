// Co-located headless test for the Angular renderer seam. Drives SymbioteRenderer
// directly — no Angular runtime, no compiler — against the shared fake Fabric slot, proving
// each Renderer2 method maps onto the engine mutation API and commits a correct Fabric tree.
// The bootstrap (mount → createComponent) is validated separately on a real host / the AOT
// example; this isolates the seam, which is the deterministic, framework-free half.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  createSurface,
  disposeRoot,
  isAnchor,
  isSymbioteNode,
  registerStyles,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';
import { SymbioteRenderer, SymbioteRendererFactory } from './index';
import { registerComposedComponent } from '../anchor-host-registry';

const ROOT_TAG = 707;
const PROBE_ID = 'probe';

const fabric = installFabric();

// A macrotask boundary drains the engine's coalesced (requestCommit) commit before asserting.
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function setup(): { surface: ReturnType<typeof createSurface>; renderer: SymbioteRenderer } {
  const surface = createSurface(ROOT_TAG);
  const renderer = new SymbioteRendererFactory(surface).createRenderer(null, null);
  if (!(renderer instanceof SymbioteRenderer))
    throw new Error('unreachable: factory built the renderer');
  return { surface, renderer };
}

beforeEach(() => fabric.reset());
afterEach(() => {
  disposeRoot(ROOT_TAG);
  clearGlobalStyles();
});

describe('Angular SymbioteRenderer drives the engine', () => {
  it('maps createElement / createText / appendChild into a committed Fabric tree', async () => {
    const { surface, renderer } = setup();
    const view = renderer.createElement('symbiote-view');
    const text = renderer.createElement('symbiote-text');
    const raw = renderer.createText('Hello');
    renderer.appendChild(text, raw);
    renderer.appendChild(view, text);
    renderer.appendChild(surface, view);
    await tick();

    // The engine wraps surface.children in the synthetic box-none AppContainer root.
    const root = fabric.appRoot();
    expect(fabric.serialize(root.children)).toBe('RCTView(RCTText(RCTRawText "Hello"))');
  });

  it('maps additional symbiote intrinsics through the shared descriptor table', async () => {
    const { surface, renderer } = setup();
    const spinner = renderer.createElement('symbiote-activity-indicator');
    renderer.setProperty(spinner, 'testID', 'spinner');
    renderer.setProperty(spinner, 'animating', true);
    const image = renderer.createElement('symbiote-image');
    renderer.setProperty(image, 'testID', 'image');
    renderer.setProperty(image, 'source', { uri: 'https://example.invalid/image.png' });
    renderer.appendChild(surface, spinner);
    renderer.appendChild(surface, image);
    await tick();

    const committed = fabric.find(node => node.props.testID === 'spinner');
    expect(committed?.viewName).toBe('ActivityIndicatorView');
    expect(committed?.props.animating).toBe(true);
    const committedImage = fabric.find(node => node.props.testID === 'image');
    expect(committedImage?.viewName).toBe('RCTImageView');
    expect(committedImage?.props.source).toEqual({ uri: 'https://example.invalid/image.png' });
  });

  it('commits setProperty and merges per-key setStyle into one style prop', async () => {
    const { surface, renderer } = setup();
    const view = renderer.createElement('symbiote-view');
    renderer.setProperty(view, 'nativeID', PROBE_ID);
    renderer.setStyle(view, 'padding', 24);
    renderer.setStyle(view, 'opacity', 0.5);
    renderer.appendChild(surface, view);
    await tick();

    const committed = fabric.find(node => node.props.nativeID === PROBE_ID);
    expect(committed, 'the probed RCTView committed').toBeDefined();
    // Angular emits a [style] binding as per-key setStyle; the seam folds them into one style
    // object, then the engine HOISTS style keys to top-level Fabric props (RN's flat C++ props
    // contract — style is never a nested key on a committed node).
    expect(committed?.props).toMatchObject({ nativeID: PROBE_ID, padding: 24, opacity: 0.5 });
  });

  it('resolves addClass tokens through the shared style registry and lets explicit style win', async () => {
    registerStyles({ card: { padding: 10, backgroundColor: 'red' } });
    const { surface, renderer } = setup();
    const view = renderer.createElement('symbiote-view');
    renderer.setProperty(view, 'nativeID', PROBE_ID);
    // Ivy compiles class="card highlight" to one addClass call per token, never a single string.
    renderer.addClass(view, 'card');
    renderer.addClass(view, 'highlight');
    renderer.setStyle(view, 'backgroundColor', 'blue');
    renderer.appendChild(surface, view);
    await tick();

    const committed = fabric.find(node => node.props.nativeID === PROBE_ID);
    // padding comes from the class; backgroundColor is explicit style, so it wins over the
    // class-derived red — same precedence Vue's class="..."/:style="..." merge guarantees.
    expect(committed?.props).toMatchObject({ padding: 10, backgroundColor: 'blue' });
  });

  it('removeClass drops a token and recomputes the resolved style', async () => {
    registerStyles({ card: { padding: 10 }, highlight: { opacity: 0.5 } });
    const { surface, renderer } = setup();
    const view = renderer.createElement('symbiote-view');
    renderer.setProperty(view, 'nativeID', PROBE_ID);
    renderer.addClass(view, 'card');
    renderer.addClass(view, 'highlight');
    renderer.removeClass(view, 'highlight');
    renderer.appendChild(surface, view);
    await tick();

    const committed = fabric.find(node => node.props.nativeID === PROBE_ID);
    expect(committed?.props.padding).toBe(10);
    expect(committed?.props.opacity).toBeUndefined();
  });

  it('removeChild detaches a node from the next commit', async () => {
    const { surface, renderer } = setup();
    const keep = renderer.createElement('symbiote-view');
    const drop = renderer.createElement('symbiote-view');
    renderer.setProperty(drop, 'nativeID', PROBE_ID);
    renderer.appendChild(surface, keep);
    renderer.appendChild(surface, drop);
    await tick();
    expect(
      fabric.find(node => node.props.nativeID === PROBE_ID),
      'present before remove',
    ).toBeDefined();

    fabric.reset();
    renderer.removeChild(surface, drop);
    await tick();
    expect(
      fabric.find(node => node.props.nativeID === PROBE_ID),
      'gone after remove',
    ).toBeUndefined();
  });

  it('createComment yields an anchor the commit walk skips but flattens its children', async () => {
    const { surface, renderer } = setup();
    const anchor = renderer.createComment();
    renderer.appendChild(anchor, renderer.createElement('symbiote-view'));
    renderer.appendChild(surface, anchor);
    renderer.appendChild(surface, renderer.createElement('symbiote-text'));
    await tick();

    // The anchor never reaches Fabric; its child keeps the same sibling position. Angular
    // composed components use this to make their framework host element disappear.
    const root = fabric.appRoot();
    expect(fabric.serialize(root.children)).toBe('RCTViewRCTText');
  });

  it('listen attaches an explicit event listener and the unlisten fn removes it', () => {
    const { renderer } = setup();
    const view = renderer.createElement('symbiote-view');
    expect(isSymbioteNode(view)).toBe(true);
    if (!isSymbioteNode(view)) throw new Error('unreachable: createElement returns a node');

    const unlisten = renderer.listen(view, 'press', () => {});
    expect(view.listeners?.has('press'), 'listener attached under the explicit name').toBe(true);
    unlisten();
    expect(view.listeners?.has('press'), 'unlisten removed it').toBe(false);
  });

  it('listen on a global target (window/document) is an inert no-op', () => {
    const { renderer } = setup();
    expect(() => renderer.listen('window', 'resize', () => {})()).not.toThrow();
  });

  // App/third-party selectors must not be hardcoded into ANCHOR_HOST_COMPONENTS — the owning
  // package registers itself via registerComposedComponent, same as an adapter-owned composed
  // component. 'RefApiDemo' names examples/angular's demo component; this test never imports
  // it, it only proves the renderer treats an unregistered selector as a raw Fabric view name,
  // not a hardcoded anchor host. MUST run before the registration test below, since
  // registerComposedComponent mutates the module-level Set for the rest of the file.
  it('does not anchor-host an app-owned selector unless it self-registers', () => {
    const { renderer } = setup();
    const node = renderer.createElement('RefApiDemo');
    if (!isSymbioteNode(node)) throw new Error('unreachable: createElement returns a node');
    expect(isAnchor(node), 'falls through to a raw Fabric view, not an anchor').toBe(false);
    expect(node.component).toBe('RefApiDemo');
  });

  it('anchor-hosts an app-owned selector once it self-registers via registerComposedComponent', () => {
    registerComposedComponent('RefApiDemo');
    const { renderer } = setup();
    const node = renderer.createElement('RefApiDemo');
    if (!isSymbioteNode(node)) throw new Error('unreachable: createElement returns a node');
    expect(isAnchor(node)).toBe(true);
  });
});
