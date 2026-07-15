// An Angular custom renderer over @symbiote-native/engine. Angular components never touch the
// DOM directly — every paint goes through Renderer2 (created per-component by
// RendererFactory2). We provide OUR factory, so each Renderer2 method maps onto the
// engine's tiny mutation API; the engine owns all Fabric clone-on-write, shared with
// every other adapter. This is the Angular twin of adapters/vue/src/renderer.ts — proof
// that the same engine mutation API drives both frameworks.

import {
  appendChild,
  createAnchor,
  createElement,
  createRawText,
  dlog,
  getExplicitStyle,
  insertBefore,
  isDebug,
  isSymbioteNode,
  removeChild,
  routeProp,
  setEventListener,
  setText,
  toPublicInstance,
  RAW_TEXT_COMPONENT,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { descriptorFor } from '@symbiote-native/components';
import type { Renderer2, RendererFactory2, RendererType2 } from '@angular/core';
import {
  getScrollViewProjection,
  removeScrollViewProjectedChild,
} from '../components/scroll-view/projection';

// Angular host nodes are all SymbioteNode (elements, raw text, anchors). The mount
// container is the surface, so a parent can be either a node or the surface root.
type IHostNode = ISymbioteNode;
type IHostElement = ISymbioteNode | SymbioteSurface;

function isSurface(parent: IHostElement): parent is SymbioteSurface {
  return parent instanceof SymbioteSurface;
}

function isRawText(node: ISymbioteNode): boolean {
  return node.component === RAW_TEXT_COMPONENT;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Diagnostic-only: tags each anchor with a sequential id so log lines can tell distinct
// anchors apart (they all otherwise print the same generic '#anchor' component name).
// Gated behind isDebug() so a production build pays zero cost (no WeakMap writes).
let anchorDebugCounter = 0;
const anchorDebugIds = new WeakMap<ISymbioteNode, number>();
function tagAnchorForDebug(node: ISymbioteNode): ISymbioteNode {
  if (isDebug()) {
    anchorDebugCounter += 1;
    anchorDebugIds.set(node, anchorDebugCounter);
  }
  return node;
}

// Diagnostic identity string for a renderer node/surface — component name, or 'surface'.
// Null-tolerant: a diagnostic must never throw (Angular hands insertBefore a null refChild).
function describeHost(node: IHostElement | null | undefined): string {
  if (node === null || node === undefined) return 'null';
  if (isSurface(node)) return 'surface';
  const anchorId = anchorDebugIds.get(node);
  return anchorId !== undefined ? `${node.component}#${anchorId}` : node.component;
}

const PRIMITIVE_SELECTOR_ALIAS: Record<string, string> = {
  // Public ergonomic selectors map directly to the engine primitive descriptors.
  View: 'symbiote-view',
  Text: 'symbiote-text',
};

// A composed component's selector must be listed so createElement gives it a non-painting
// anchor host (see the set comment below). Tests register their own child-component selectors
// through this at module load; app-authored composed components can too.
export function registerComposedComponent(selector: string): void {
  ANCHOR_HOST_COMPONENTS.add(selector.toLowerCase());
}

// Lowercased at construction — createElement's lookup and registerComposedComponent's insert
// both normalize to lowercase (Angular lowercases a dynamically-mounted component's selector at
// runtime, see §11a), so the literal entries below must match that or every capitalized one
// (all but the handful already written lowercase) silently never matches .has() and falls
// through to a real Fabric createNode — the exact "Unimplemented component" / extra-wrapper-node
// bug this Set exists to prevent.
const ANCHOR_HOST_COMPONENTS: Set<string> = new Set(
  [
    // Composed Angular components render their real Fabric descriptor tree from the template;
    // their Angular host element is only a framework bookkeeping node and must not paint. This
    // is NOT limited to adapter-authored components — ANY custom composed @Component used as a
    // plain <Tag> inside another template needs its selector listed here too, or Angular's
    // automatic host-element creation for it falls through to a raw Fabric createNode call with
    // an unrecognized view name, which paints RN's own "Unimplemented component: <Tag>" fallback
    // view instead (a real device-visible bug, not a silent no-op). This Set holds only
    // adapter/engine-owned selectors; app code and third-party packages self-register their own
    // composed components through registerComposedComponent instead of being hardcoded here.
    'ActivityIndicator',
    'Button',
    'FlatList',
    'AnimatedView',
    'symbiote-animated-view',
    'AnimatedText',
    'symbiote-animated-text',
    'AnimatedImage',
    'symbiote-animated-image',
    'AnimatedScrollView',
    'symbiote-animated-scroll-view',
    'symbiote-descriptor-outlet',
    'tunnel-out',
    'Image',
    'ImageBackground',
    'InputAccessoryView',
    'KeyboardAvoidingView',
    'Modal',
    'Pressable',
    'RefreshControl',
    'SafeAreaView',
    'ScrollView',
    'ScrollViewStickyHeader',
    'SectionList',
    'symbiote-sticky-header',
    'StatusBar',
    'Switch',
    'Text',
    'TextInput',
    'TouchableHighlight',
    'TouchableNativeFeedback',
    'TouchableOpacity',
    'TouchableWithoutFeedback',
    'VirtualizedList',
    'VirtualizedSectionList',
    'symbiote-pressable',
  ].map(selector => selector.toLowerCase()),
);

// Inserting a bare raw-text node anywhere but inside a <Text> is invalid in Fabric (a
// stray RCTRawText would paint). Angular's ɵɵtext only ever lands text inside a <Text>,
// but guard anyway for parity with the Vue adapter and to fail loudly on a bad template.
function assertTextPlacement(child: ISymbioteNode, parent: IHostElement): void {
  if (isRawText(child) && (isSurface(parent) || !parent.isText)) {
    throw new Error(`Text string "${String(child.props.text)}" must be rendered inside a <Text>`);
  }
}

// One renderer per mounted surface. Every mutation asks the surface to (microtask-
// coalesced) recommit — the same seam Vue uses; a burst of Angular change-detection
// mutations collapses into one completeRoot.
export class SymbioteRenderer implements Renderer2 {
  readonly data: Record<string, unknown> = {};
  // Angular calls destroyNode per-node only when this is non-null; teardown happens in
  // render.ts (unmount), so per-node cleanup is a no-op.
  destroyNode: ((node: ISymbioteNode) => void) | null = null;

  constructor(private readonly surface: SymbioteSurface) {}

  destroy(): void {}

  createElement(name: string): IHostNode {
    // `name` is the component's host tag — a symbiote intrinsic (`symbiote-view`,
    // `symbiote-text`, …), a public ergonomic alias (`View`, `Text`), or a raw Fabric view
    // name for a native leaf. Public aliases are normalized to their engine primitive name
    // before descriptor lookup. descriptorFor resolves it; an unknown `symbiote-*` is a typo,
    // any other string flows through as a raw Fabric name (events/processors derived from its
    // ViewConfig). toPublicInstance grafts the imperative API (measure / setNativeProps /
    // focus) onto the raw node in place, returning the SAME identity the commit mirror keys on.
    const engineName = PRIMITIVE_SELECTOR_ALIAS[name] ?? name;
    if (ANCHOR_HOST_COMPONENTS.has(engineName.toLowerCase())) {
      const anchor = tagAnchorForDebug(createAnchor());
      dlog(`angular createElement ${name} -> anchor host ${describeHost(anchor)}`);
      return anchor;
    }

    const descriptor = descriptorFor(engineName);
    const node = createElement(descriptor.component, descriptor.isText);
    dlog(`angular createElement ${name} -> ${descriptor.component}`);
    return toPublicInstance(node);
  }

  createComment(): IHostNode {
    // Angular structural directives (*ngIf / @if / @for) need anchor nodes to track
    // position. A real retained node the commit walk SKIPS — no native view. Twin of the
    // Vue createComment path.
    const anchor = tagAnchorForDebug(createAnchor());
    dlog(`Angular renderer createComment -> ${describeHost(anchor)}`);
    return anchor;
  }

  createText(value: string): IHostNode {
    return createRawText(value);
  }

  appendChild(parent: IHostElement | null, newChild: IHostNode): void {
    // Angular defers insertion for content awaiting its host component's own projection
    // (see parentNode below) — mirrors Angular's own `if (parentRNode !== null)` guard in
    // addLViewToLContainer: skip silently now, the later projection pass places it correctly.
    if (parent === null) return;
    assertTextPlacement(newChild, parent);
    if (isSurface(parent)) {
      dlog(`Angular renderer appendChild parent=surface child=${describeHost(newChild)}`);
      parent.appendChild(newChild);
    } else {
      const projection = getScrollViewProjection(parent);
      dlog(
        `Angular renderer appendChild parent=${describeHost(parent)} child=${describeHost(newChild)} projection=${projection !== undefined}`,
      );
      if (projection !== undefined) {
        projection.appendProjectedChild(parent, newChild, (target, child) =>
          appendChild(target, child),
        );
      } else {
        appendChild(parent, newChild);
      }
    }
    this.surface.requestCommit();
  }

  insertBefore(parent: IHostElement | null, newChild: IHostNode, refChild: IHostNode | null): void {
    if (parent === null) return; // see the appendChild guard above
    assertTextPlacement(newChild, parent);
    if (isSurface(parent)) {
      dlog(
        `Angular renderer insertBefore parent=surface child=${describeHost(newChild)} ref=${refChild ? describeHost(refChild) : 'null'}`,
      );
      if (refChild) parent.insertBefore(newChild, refChild);
      else parent.appendChild(newChild);
    } else {
      const projection = getScrollViewProjection(parent);
      dlog(
        `Angular renderer insertBefore parent=${describeHost(parent)} child=${describeHost(newChild)} ref=${refChild ? describeHost(refChild) : 'null'} projection=${projection !== undefined}`,
      );
      if (projection !== undefined) {
        projection.insertProjectedChild(parent, newChild, refChild, (target, child, before) => {
          if (before === undefined) appendChild(target, child);
          else insertBefore(target, child, before);
        });
      } else if (refChild) {
        insertBefore(parent, newChild, refChild);
      } else {
        appendChild(parent, newChild);
      }
    }
    this.surface.requestCommit();
  }

  removeChild(_parent: IHostElement | null, oldChild: IHostNode): void {
    // Detach from the child's own retained parent (a top-level node lives in
    // surface.children with no parent). Angular's `parent` arg is ignored in favor of the
    // authoritative link, mirroring the Vue adapter's remove.
    const angularParent = _parent !== null ? describeHost(_parent) : 'null';
    const retainedParent = oldChild.parent !== undefined ? describeHost(oldChild.parent) : 'none';
    const wasProjected = removeScrollViewProjectedChild(oldChild, (parent, child) =>
      removeChild(parent, child),
    );
    dlog(
      `Angular renderer removeChild angularParent=${angularParent} retainedParent=${retainedParent} child=${describeHost(oldChild)} viaProjection=${wasProjected}`,
    );
    if (!wasProjected) {
      const parent = oldChild.parent;
      if (parent !== undefined) removeChild(parent, oldChild);
      else this.surface.removeChild(oldChild);
    }
    this.surface.requestCommit();
  }

  // FlatList/VirtualizedList cells are content projected into a component host (our
  // ANCHOR_HOST_COMPONENTS, e.g. ScrollView) — Angular's own addLViewToLContainer
  // (.vendors/angular node_manipulation.ts/container.ts) treats a null parent here as "defer —
  // the child component's own <ng-content>/ɵɵprojection will place this once its structure
  // resolves" (e.g. ScrollView's `@if(isHorizontal)` branch). Renderer2's contract types this
  // return as nullable for exactly that reason; returning `this.surface` as a non-null fallback
  // defeated that defer check and caused premature top-level insertion (2026-07: FlatList cells
  // rendered outside their ScrollView).
  //
  // Safe only because appendChild/insertBefore above now also treat a null parent as "skip, wait
  // for projection" — a second Angular call site (`insertAnchorNode`, hit whenever a directive
  // does `inject(ViewContainerRef)`, e.g. VListOutletDirective) forwards this null straight into
  // insertBefore without checking it; without that guard it crashed on-device.
  parentNode(node: IHostNode): IHostElement | null {
    return node.parent ?? null;
  }

  nextSibling(node: IHostNode): IHostNode | null {
    const siblings = node.parent !== undefined ? node.parent.children : this.surface.children;
    const index = siblings.indexOf(node);
    return index >= 0 ? (siblings[index + 1] ?? null) : null;
  }

  // locateHostElement always routes createComponent's `hostElement` THROUGH here as
  // `selectorOrNode` (Angular's own core.mjs) — it is never bypassed just because a real
  // object (vs. a selector string) was given. A string only reaches us on the (unused here)
  // selector-string bootstrap path, so the surface is the fallback for that case only.
  selectRootElement(selectorOrNode: string | IHostElement): IHostElement {
    return typeof selectorOrNode === 'string' ? this.surface : selectorOrNode;
  }

  setAttribute(el: IHostElement, name: string, value: string): void {
    if (isSurface(el)) return;
    routeProp(el, name, value);
    this.surface.requestCommit();
  }

  removeAttribute(el: IHostElement, name: string): void {
    if (isSurface(el)) return;
    routeProp(el, name, undefined);
    this.surface.requestCommit();
  }

  // Ivy compiles every class= / [class.foo] / [ngClass] form down to per-token addClass/
  // removeClass calls (never a single setAttribute('class', ...) call), so a per-node token set
  // is accumulated here and re-joined into one string on every change, then handed to
  // routeProp('class', ...) exactly like Vue's template `class="..."` and React's JSX
  // `className="..."` — all three resolve through the SAME centralized class+style merge in
  // core/engine/src/node.ts, so a class registered via the SFC/CSS-Modules style compiler
  // resolves identically regardless of adapter.
  private readonly classTokens = new WeakMap<IHostNode, Set<string>>();

  addClass(el: IHostElement, name: string): void {
    if (isSurface(el)) return;
    const tokens = this.classTokens.get(el) ?? new Set<string>();
    tokens.add(name);
    this.classTokens.set(el, tokens);
    routeProp(el, 'class', [...tokens].join(' '));
    this.surface.requestCommit();
  }

  removeClass(el: IHostElement, name: string): void {
    if (isSurface(el)) return;
    const tokens = this.classTokens.get(el);
    if (tokens === undefined) return;
    tokens.delete(name);
    routeProp(el, 'class', tokens.size > 0 ? [...tokens].join(' ') : undefined);
    this.surface.requestCommit();
  }

  // Angular decomposes a [style] binding into per-key setStyle calls (ɵɵstyleMap). RN wants
  // the whole style object as one `style` prop, so merge each key into it — onto the explicit
  // style half tracked by routeProp's centralized class+style merge (core/engine/src/node.ts),
  // NOT el.props.style directly: that may now be the [classStyle, explicitStyle] array the
  // merge writes, and spreading an array as a record would silently produce numeric-index keys.
  setStyle(el: IHostElement, style: string, value: unknown): void {
    if (isSurface(el)) return;
    const current = getExplicitStyle(el);
    const base = isRecord(current) ? current : {};
    routeProp(el, 'style', { ...base, [style]: value });
    this.surface.requestCommit();
  }

  removeStyle(el: IHostElement, style: string): void {
    if (isSurface(el)) return;
    const current = getExplicitStyle(el);
    if (!isRecord(current)) return;
    const { [style]: _removed, ...rest } = current;
    routeProp(el, 'style', rest);
    this.surface.requestCommit();
  }

  // [prop]="x" bindings. routeProp makes the prop-vs-event decision from the node's
  // ViewConfig (identical to React/Vue), so the whole flat-bag prop layer is shared.
  setProperty(el: IHostElement, name: string, value: unknown): void {
    if (isSurface(el)) return;
    routeProp(el, name, value);
    this.surface.requestCommit();
  }

  setValue(node: IHostNode, value: string): void {
    // A useful permanent seam: text mutations are low-frequency and the one place a stale
    // `{{binding}}` (a change-detection gap) shows up as "the setValue never fired".
    dlog(`Angular renderer setValue "${value}" on ${describeHost(node)}`);
    setText(node, value);
    this.surface.requestCommit();
  }

  // (event)="x" bindings. Angular hands the event name EXPLICITLY (no onX->x inference),
  // so we drive the engine's structural event channel directly — the path setEventListener
  // in core/engine/src/node.ts already names "Angular Renderer2.listen" for. Global targets
  // (window/document/body) have no Fabric node, so they no-op.
  listen(
    target: unknown,
    eventName: string,
    callback: (event: unknown) => boolean | void,
  ): () => void {
    if (!isSymbioteNode(target)) return () => {};
    setEventListener(target, eventName, callback);
    return () => setEventListener(target, eventName, undefined);
  }
}

// Provided to Angular as RendererFactory2; createRenderer returns the single
// surface-bound renderer for every component (begin/end commit-coalescing is unnecessary —
// requestCommit already microtask-coalesces).
export class SymbioteRendererFactory implements RendererFactory2 {
  private renderer: SymbioteRenderer | undefined;

  constructor(private readonly surface: SymbioteSurface) {}

  createRenderer(_hostElement: unknown, _type: RendererType2 | null): Renderer2 {
    return (this.renderer ??= new SymbioteRenderer(this.surface));
  }
}
