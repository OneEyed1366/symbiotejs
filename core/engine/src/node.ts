// The retained shadow-tree. Adapters mutate this cheap in-memory tree through a
// tiny API; the commit engine (commit.ts) later walks it and translates the
// whole thing into Fabric's clone-on-write child sets. Keeping the retained
// tree mutable while the Fabric mirror stays persistent lets every adapter mutate
// freely without touching Fabric's clone-on-write protocol directly, and it
// lives here in shared so no adapter re-implements it.

import { isEventFor } from './view-config';
import { isClassNameValue, resolveClassName } from './style-registry';
import { dlog } from './debug';

const BRAND: unique symbol = Symbol('symbiote.node');

// A node carries the Fabric view name directly, so adding a primitive (Image,
// ScrollView, TextInput) is just a new string from the adapter, no core change.
// The only name resolved at commit time is text: a <Text> nested inside another
// <Text> becomes a virtual span. `isText` marks a text container so its
// descendants pick the virtual variant.
export const RAW_TEXT_COMPONENT = 'RCTRawText';
export const TEXT_COMPONENT = 'RCTText';
export const VIRTUAL_TEXT_COMPONENT = 'RCTVirtualText';

export interface ISymbioteEvent {
  type: string;
  // `target` is the node the gesture started on; `currentTarget` is the node
  // whose listener is running right now as the event bubbles toward the root.
  target: ISymbioteNode;
  currentTarget: ISymbioteNode;
  nativeEvent: Record<string, unknown>;
  stopPropagation: () => void;
}
// Returns `unknown`, not `void`: the responder negotiation reads a boolean back
// from onStartShouldSetResponder / onResponderTerminationRequest. Bubbling/direct
// dispatch ignore the return; only the responder path consults it.
export type IListener = (event: ISymbioteEvent) => unknown;

export interface ISymbioteNode {
  readonly [BRAND]: true;
  // Fabric view name passed to createNode (RCTView, RCTImageView, RCTText, ...).
  readonly component: string;
  // A text container: its descendants render as virtual text spans.
  readonly isText: boolean;
  props: Record<string, unknown>;
  listeners: Map<string, IListener> | undefined;
  children: ISymbioteNode[];
  parent: ISymbioteNode | undefined;
}

export function createElement(component: string, isText = false): ISymbioteNode {
  return {
    [BRAND]: true,
    component,
    isText,
    props: {},
    listeners: undefined,
    children: [],
    parent: undefined,
  };
}

export function createRawText(text: string): ISymbioteNode {
  return {
    [BRAND]: true,
    component: RAW_TEXT_COMPONENT,
    isText: false,
    props: { text },
    listeners: undefined,
    children: [],
    parent: undefined,
  };
}

// `instanceHandle` round-trips through Fabric unchanged: the object we pass to
// createNode comes back as the event target. We brand our nodes so the event
// handler can confirm a target is one of ours before dispatching.
export function isSymbioteNode(value: unknown): value is ISymbioteNode {
  return typeof value === 'object' && value !== null && BRAND in value;
}

// Investigation instrumentation (HeaderOptionsScreen search-bar-ref "node not committed" bug):
// a WeakMap can't be logged, so this gives every node a small human-readable id, assigned lazily
// on first call — lets a dlog at ref-attach time and a dlog at commit/dispatch time be compared
// directly to prove whether they're the SAME node object or two different ones. Kept behind
// DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
const debugIds = new WeakMap<ISymbioteNode, number>();
let nextDebugId = 1;
export function debugNodeId(node: ISymbioteNode): number {
  let id = debugIds.get(node);
  if (id === undefined) {
    id = nextDebugId++;
    debugIds.set(node, id);
  }
  return id;
}

// Vue's runtime-core needs comment/anchor nodes (fragments, v-if, v-for) to track
// sibling order; Fabric has no such concept. An anchor is a real retained node so
// insert/nextSibling/parentNode ordering stays correct, but the commit walk SKIPS it
// (commit.ts): no native view is ever created. Marked by a sentinel component name,
// not a new field, so the hot SymbioteNode shape is untouched.
export const ANCHOR_COMPONENT = '#anchor';

export function createAnchor(): ISymbioteNode {
  return createElement(ANCHOR_COMPONENT);
}

export function isAnchor(node: ISymbioteNode): boolean {
  return node.component === ANCHOR_COMPONENT;
}

// A pure prop set: no event inference. `onTintColor` is a Switch prop and reaches
// Fabric like any other; the event-vs-prop decision is made by routeProp, never by
// the key's name.
export function setProp(node: ISymbioteNode, key: string, value: unknown): void {
  if (value === undefined) {
    delete node.props[key];
  } else {
    node.props[key] = value;
  }
}

// Fabric gates layout events behind a boolean prop (BaseViewProps.onLayout): unlike
// scroll / touch / change, which the native component emits unconditionally, a
// layout event fires only when the shadow node is flagged. So a `layout` listener
// must also raise that prop, mirroring RN's `onLayout: true` validAttribute;
// otherwise onLayout never fires and anything measuring its own box (VirtualizedList
// viewport) stays at zero.
const LAYOUT_EVENT = 'layout';
const LAYOUT_FLAG_PROP = 'onLayout';

// The explicit event channel. Structural adapters (Svelte addEventListener, Angular
// Renderer2.listen) call this directly with an already-known event name; flat-bag
// adapters reach it through routeProp. A non-function value clears the listener.
export function setEventListener(node: ISymbioteNode, name: string, value: unknown): void {
  const isHandler = typeof value === 'function';
  if (isHandler) {
    const handler = value;
    const listeners = (node.listeners ??= new Map());
    listeners.set(name, (event: ISymbioteEvent) => handler(event));
  } else {
    node.listeners?.delete(name);
  }
  if (name === LAYOUT_EVENT) setProp(node, LAYOUT_FLAG_PROP, isHandler ? true : undefined);
}

const ON_PREFIX = /^on[A-Z]/;

// onChange -> change
function listenerName(propName: string): string {
  return propName.charAt(2).toLowerCase() + propName.slice(3);
}

// The responder-negotiation events (PanResponder's panHandlers). They are a
// JS-side protocol the event layer synthesizes from raw touches, NOT Fabric
// ViewConfig events, so isEventFor never reports them. Treat them as listeners on
// any node so PanResponder's handlers actually attach (rather than routing to
// setProp and reaching Fabric as dead props). Names are post-listenerName.
const RESPONDER_EVENTS: ReadonlySet<string> = new Set([
  'startShouldSetResponder',
  'startShouldSetResponderCapture',
  'moveShouldSetResponder',
  'moveShouldSetResponderCapture',
  'responderGrant',
  'responderReject',
  'responderStart',
  'responderMove',
  'responderEnd',
  'responderRelease',
  'responderTerminate',
  'responderTerminationRequest',
]);

// React's JSX dev transform (transform-react-jsx-self / -source, injected by RN's babel
// preset whenever dev=true) annotates every element with __self (the component instance)
// and __source ({ fileName, lineNumber, columnNumber }). React's own Fabric host config
// consumes both and never forwards them. A JSX-based adapter (Vue JSX, Solid JSX) instead
// carries them onto the vnode as ordinary props, so they reach setProp and then Fabric,
// where Android's folly::dynamic rejects __self with "JS Functions are not convertible to
// dynamic" (the instance holds functions) and the surface paints black, while iOS silently
// drops it. SFC/template authoring never produces them. Strip them here, once, so no
// adapter leaks React JSX dev metadata to the host, mirroring React's host config.
const REACT_JSX_DEV_PROPS: ReadonlySet<string> = new Set(['__self', '__source']);

// `class`/`className` and `style` can each be set independently and out of order — Vue's
// patchProp fires one call per changed key, Angular's addClass/removeClass and setStyle are
// separate Renderer2 calls, and even React re-invokes routeProp once per changed prop on an
// update — but setProp does a flat overwrite with no merge, so whichever call lands last would
// silently clobber the other. Track both halves per node so either update recomputes the same
// [classStyle, explicitStyle] pair; flattenStyle's later-wins array collapse
// (core/engine/src/style/index.ts) then always resolves with the explicit `style` prop winning
// over the class-derived one, regardless of call order. This lives here, not per-adapter, so
// class="..."/className="..." resolve through the shared style registry identically everywhere:
// React JSX `className`, Vue template `class`, and Angular's addClass/removeClass token
// accumulation (adapters/angular/src/renderer.ts, which joins its tokens into one string and
// hands it to routeProp same as the others) all funnel through the same two branches below.
interface IClassStyleParts {
  classStyle?: unknown;
  explicitStyle?: unknown;
}
const classStyleParts = new WeakMap<ISymbioteNode, IClassStyleParts>();

function commitClassStyle(node: ISymbioteNode, patch: Partial<IClassStyleParts>): void {
  const entry = { ...classStyleParts.get(node), ...patch };
  classStyleParts.set(node, entry);
  setProp(node, 'style', [entry.classStyle, entry.explicitStyle]);
}

// The explicit (non-class-derived) style half, for an adapter that builds its style prop up
// key-by-key (Angular's Ivy ɵɵstyleProp/setStyle) instead of handing over one whole object —
// it must merge onto this, not onto node.props.style directly, which may be the
// [classStyle, explicitStyle] array commitClassStyle writes above.
export function getExplicitStyle(node: ISymbioteNode): unknown {
  return classStyleParts.get(node)?.explicitStyle;
}

const CLASS_PROP_KEYS: ReadonlySet<string> = new Set(['class', 'className']);

// The flat-bag split (React / Vue / Solid): an `onX` prop becomes an event listener
// ONLY when the node's component actually declares `x` as an event (per the shared
// ViewConfig). Otherwise it is a plain prop, so `onTintColor` on a Switch, whose
// only event is `change`, routes to setProp and reaches Fabric.
export function routeProp(node: ISymbioteNode, key: string, value: unknown): void {
  if (REACT_JSX_DEV_PROPS.has(key)) return;
  if (CLASS_PROP_KEYS.has(key)) {
    commitClassStyle(node, {
      classStyle: resolveClassName(isClassNameValue(value) ? value : undefined),
    });
    return;
  }
  if (key === 'style') {
    commitClassStyle(node, { explicitStyle: value });
    return;
  }
  if (ON_PREFIX.test(key)) {
    const name = listenerName(key);
    const isRegisteredEvent = RESPONDER_EVENTS.has(name) || isEventFor(node.component, name);
    // Investigation instrumentation (HeaderOptionsScreen unresponsive-buttons bug): RNS* views
    // derive their events from react-native-screens' own codegen ViewConfig (registry.ts), so an
    // unregistered event silently falls through to setProp below — a dead prop Fabric ignores,
    // indistinguishable from "the button did nothing" at the UI. Scoped to RNS* to avoid noise
    // from the rest of the app. Kept behind DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
    if (node.component.startsWith('RNS')) {
      dlog(
        `routeProp: ${node.component} "${key}" -> listener "${name}" ` +
          `registered=${isRegisteredEvent} at t=${Date.now()}`,
      );
    }
    if (isRegisteredEvent) {
      setEventListener(node, name, value);
      return;
    }
  }
  setProp(node, key, value);
}

export function setText(node: ISymbioteNode, text: string): void {
  node.props.text = text;
}

function detach(child: ISymbioteNode): void {
  const parent = child.parent;
  if (!parent) return;
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
  child.parent = undefined;
}

export function appendChild(parent: ISymbioteNode, child: ISymbioteNode): void {
  detach(child);
  child.parent = parent;
  parent.children.push(child);
}

export function insertBefore(
  parent: ISymbioteNode,
  child: ISymbioteNode,
  beforeChild: ISymbioteNode,
): void {
  detach(child);
  child.parent = parent;
  const index = parent.children.indexOf(beforeChild);
  parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
}

export function removeChild(parent: ISymbioteNode, child: ISymbioteNode): void {
  const index = parent.children.indexOf(child);
  if (index >= 0) parent.children.splice(index, 1);
  child.parent = undefined;
}
