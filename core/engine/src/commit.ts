// The clone-on-write engine. Fabric is persistent: you never mutate a committed
// node, you clone it with new props/children and atomically hand a fresh child
// set to completeRoot.
//
// Incremental strategy: each retained node keeps a "mirror" of what Fabric
// currently holds for it: its handle, the flat props last sent, the child
// identities last committed, and the resolved view name. On commit we walk the
// retained tree and only clone the nodes that actually changed; an untouched
// sibling subtree is reused by reference. That both skips work and preserves the
// native view state (scroll offset, text cursor) that a full rebuild would wipe
// on every commit. A change bubbles up: re-cloning a leaf
// forces each ancestor to re-clone too, because a persistent parent holds
// references to specific child handles. That bubble is inherent to a persistent
// tree and is exactly what React's own Fabric renderer does.

import {
  getSlot,
  type IFabricNode,
  type IFabricProps,
  type IRootTag,
  type IMeasureOnSuccess,
  type IMeasureInWindowOnSuccess,
  type IMeasureLayoutOnSuccess,
} from './fabric';
import {
  createElement,
  isAnchor,
  RAW_TEXT_COMPONENT,
  VIRTUAL_TEXT_COMPONENT,
  type ISymbioteNode,
} from './node';
import { dlog, isDebug } from './debug';
import { flattenStyle } from './style';
import { registeredProcessor } from './registry';
import { nextTag } from './tags';
import { isOpaqueColorValue, type IColorValue } from './platform-color';
import { processBoxShadow } from './process-box-shadow';
import { registerPostCommit, runPostCommitHooks } from './post-commit';
import { processFilter } from './process-filter';
import { processTransformOrigin } from './process-transform-origin';
import { processTransform } from './process-transform';
import { processAspectRatio } from './process-aspect-ratio';
import { processFontVariant } from './process-font-variant';

// Per-commit work counters, surfaced via dlog so a device run can prove the
// engine is incremental (created=0 with clones after the first mount).
const stats = { created: 0, cloneProps: 0, cloneChildren: 0, reused: 0 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Diagnostic (gated): Fabric serializes props to folly::dynamic, which rejects a JS
// Symbol or function with "JS Symbols are not convertible to dynamic". A hard native
// throw deep in cloneNode*. Walk a props payload and return the dotted path of the
// first non-serializable leaf (Symbol / function), or undefined when clean, so the
// offending key is named in logcat instead of a bare stack at the JSI boundary.
//
// Bounded on purpose: a real Fabric prop tree is shallow (style/transform ~depth 3) and
// a leaked React element trips at depth 2 (`children` -> element -> $$typeof). `seen`
// breaks reference cycles and DEPTH caps runaway nesting, so the diagnostic itself can
// never overflow the stack on cyclic props (an event-carrying handler, a self-referential
// style). A crashing guard would be worse than the bug it hunts.
const NON_SERIALIZABLE_SCAN_DEPTH = 6;
function firstNonSerializablePath(
  value: unknown,
  path: string,
  depth: number,
  seen: WeakSet<object>,
): string | undefined {
  const kind = typeof value;
  if (kind === 'symbol' || kind === 'function') return `${path}=<${kind}>`;
  if (depth >= NON_SERIALIZABLE_SCAN_DEPTH) return undefined;
  if (Array.isArray(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    for (let index = 0; index < value.length; index += 1) {
      const found = firstNonSerializablePath(value[index], `${path}[${index}]`, depth + 1, seen);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (isRecord(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    for (const key of Object.keys(value)) {
      const next = path === '' ? key : `${path}.${key}`;
      const found = firstNonSerializablePath(value[key], next, depth + 1, seen);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

// Name the offending prop before the JSI boundary throws. Gated, so the deep walk only
// runs while debugging; in production the clone proceeds straight to native.
function guardSerializable(propsDiff: IFabricProps, viewName: string, tag: number): void {
  if (!isDebug()) return;
  const bad = firstNonSerializablePath(propsDiff, '', 0, new WeakSet());
  if (bad !== undefined) dlog(`NON-SERIALIZABLE prop on ${viewName}#${tag}: ${bad}`);
}

// Color props must reach Fabric as platform ints, not CSS strings. Fabric's C++
// color parser silently drops strings. The actual conversion (processColor) is
// RN-platform-specific, so it is injected here rather than imported, keeping
// shared free of a react-native dependency (and the headless harness working).
const COLOR_PROPS: ReadonlySet<string> = new Set([
  'backgroundColor',
  'color',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  // Logical (writing-direction-relative) border colors + the block axis, all wired to
  // processColor in RN's ReactNativeStyleAttributes. borderStartColor/borderEndColor are
  // even publicly typed ColorValue, so they silently dropped on iOS / threw on Android.
  'borderStartColor',
  'borderEndColor',
  'borderBlockColor',
  'borderBlockStartColor',
  'borderBlockEndColor',
  'shadowColor',
  // Text shadow + the W3C `outline`/image `overlay` colors, also processColor in RN.
  'textShadowColor',
  'overlayColor',
  'outlineColor',
  'tintColor',
  // TextInput color props. iOS's native input accepts a CSS string, but Android's
  // AndroidTextInput is strict ("ColorValue: the value must be a number or Object"),
  // so these must be processColor'd here too, same as any other color reaching Fabric.
  'placeholderTextColor',
  'selectionColor',
  'cursorColor',
  'underlineColorAndroid',
  // Text decoration color (underline/strike): same Fabric strictness as any color.
  'textDecorationColor',
  'selectionHandleColor',
  // Switch track/thumb colors. RN processColors each via the Switch ViewConfig
  // (SwitchNativeComponent / AndroidSwitchNativeComponent validAttributes). iOS takes
  // onTintColor (ON) / tintColor (OFF); Android takes trackColorForTrue/False +
  // trackTintColor, and Android's ColorPropConverter is strict ("the value must be a
  // number or Object"), so a raw CSS string crashes. thumbTintColor reaches both.
  'onTintColor',
  'thumbTintColor',
  'trackColorForTrue',
  'trackColorForFalse',
  'trackTintColor',
]);

// Accepts a CSS string or an opaque PlatformColor / DynamicColorIOS object. RN's
// processColor (the value the canary injects) handles both, resolving the opaque
// shapes to the platform ints/dicts iOS UIColor expects.
let colorProcessor: (value: IColorValue) => unknown = value => value;

export function setColorProcessor(process: (value: IColorValue) => unknown): void {
  colorProcessor = process;
}

// Public mirror of RN's processColor: run a color through the injected platform
// processor (the canary wires RN's own). Off a real host it resolves CSS strings
// and opaque PlatformColor objects to the platform ints Fabric expects; headless
// (no processor wired) it is the identity, so smokes see the input unchanged.
export function processColor(color: IColorValue): unknown {
  return colorProcessor(color);
}

// A color-keyed value the platform processor must convert before Fabric: a CSS
// string, or an opaque PlatformColor / DynamicColorIOS object. Numbers (already
// platform ints) and undefined are left untouched.
function isProcessableColor(value: unknown): value is IColorValue {
  return typeof value === 'string' || isOpaqueColorValue(value);
}

// Structured CSS-style keys RN parses in JS before native (boxShadow/filter register
// with enableNativeCSSParsing(), which DEFAULTS TO FALSE, so native CSS parsing is off
// and the raw string is dropped). Each runs on the hoisted top-level style key, turning
// a CSS string or structured array into the processed array Fabric's C++ expects.
const STYLE_PROCESSORS = new Map<string, (value: unknown) => unknown>([
  ['boxShadow', value => processBoxShadow(asBoxShadowInput(value))],
  ['filter', value => processFilter(asFilterInput(value))],
  ['transformOrigin', value => processTransformOrigin(asTransformOriginInput(value))],
  ['transform', processTransformValue],
  ['aspectRatio', value => processAspectRatio(asAspectRatioInput(value))],
  ['fontVariant', value => processFontVariant(asFontVariantInput(value))],
]);

// boxShadow accepts a CSS string or an array of shadow objects; anything else is
// undefined to processBoxShadow (which returns []). Narrowing avoids an `as` cast.
function asBoxShadowInput(value: unknown): Parameters<typeof processBoxShadow>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// filter accepts a CSS string or an array of single-key filter objects; same narrowing.
function asFilterInput(value: unknown): Parameters<typeof processFilter>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isRecord);
  return undefined;
}

// transformOrigin accepts a CSS string or a [x, y, z] array of strings/numbers; anything
// else is undefined to processTransformOrigin (which defaults to center/center/0).
function asTransformOriginInput(value: unknown): Parameters<typeof processTransformOrigin>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isStringOrNumber);
  return undefined;
}

// aspectRatio accepts a number (the common, working form) or a ratio string; otherwise
// undefined, which processAspectRatio drops.
function asAspectRatioInput(value: unknown): Parameters<typeof processAspectRatio>[0] {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

// fontVariant accepts an array of variant strings (the common, working form) or a
// space-separated string; anything else becomes an empty string, which yields [].
function asFontVariantInput(value: unknown): Parameters<typeof processFontVariant>[0] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(isString);
  return '';
}

// transform accepts a CSS string (processTransform parses it) or an array of single-key
// transform records (the hot animated / sticky-header path, passed through unchanged).
// A non-string non-array value is NOT dropped: it may already be processed, so it passes
// through verbatim rather than being coerced to [] (which would erase a valid transform).
function processTransformValue(value: unknown): unknown {
  if (typeof value === 'string') return processTransform(value);
  if (Array.isArray(value)) return processTransform(value.filter(isRecord));
  return value;
}

function isStringOrNumber(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

// Convert a prop to the shape Fabric's C++ expects. A third-party view contributes
// its own processors, auto-derived from its ViewConfig (validAttributes[*].process,
// e.g. processColor for a slider's track tints); those run first. Then the structured
// CSS-style processors (boxShadow/filter). Built-ins are never in the registry, so they
// fall through to the global color path, where any CSS-string color is run through the
// injected platform processor (Fabric's C++ color parser silently drops strings).
function processValue(component: string, key: string, value: unknown): unknown {
  const processor = registeredProcessor(component, key);
  if (processor !== undefined) return processor(value);
  const styleProcessor = STYLE_PROCESSORS.get(key);
  if (styleProcessor !== undefined) return styleProcessor(value);
  if (COLOR_PROPS.has(key) && isProcessableColor(value)) return colorProcessor(value);
  return value;
}

function viewNameFor(node: ISymbioteNode, hasTextAncestor: boolean): string {
  // The only position-dependent name: a <Text> inside another <Text> becomes a
  // virtual span. Everything else is the component string the adapter chose.
  return node.isText && hasTextAncestor ? VIRTUAL_TEXT_COMPONENT : node.component;
}

// Translate the retained node's logical props into the flat payload Fabric's C++
// props expect: `style` keys are hoisted to the top level, event handlers and
// undefined values are dropped.
function fabricProps(node: ISymbioteNode): IFabricProps {
  if (node.component === RAW_TEXT_COMPONENT) {
    return { text: node.props.text };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.props)) {
    if (key === 'style') continue;
    if (typeof value === 'function') continue;
    if (value === undefined) continue;
    out[key] = processValue(node.component, key, value);
  }
  // Collapse style (object | array | nested arrays) into one flat payload before
  // hoisting: `style={[base, override]}` is RN's idiom and Fabric wants it flat.
  const style = flattenStyle(node.props.style);
  for (const [key, value] of Object.entries(style)) {
    if (value !== undefined) out[key] = processValue(node.component, key, value);
  }
  return out;
}

// Fabric's clone*WithNewProps MERGES the raw payload onto the node's existing props,
// so the payload must be a MINIMAL diff: only the keys that actually changed, plus any
// key the node held last time but no longer has, sent as `null` so Fabric resets it to
// default (e.g. `opacity` when a pressed style releases). Mirror React's diffProperties
// exactly: re-sending an UNCHANGED key is not a no-op, it re-invokes that prop's native
// setter, and some ViewManagers rebuild on any set. AndroidProgressBar's `styleAttr`
// setter recreates the whole ProgressBar via setStyle(), so re-sending it on an
// animating-only toggle dropped and rebuilt the spinner each time, and it never came
// back. Only matters for clones: a fresh createNode starts from nothing.
function diffProps(previous: IFabricProps, next: IFabricProps): IFabricProps {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (!jsonEqual(previous[key], next[key])) out[key] = next[key];
  }
  for (const key of Object.keys(previous)) {
    if (!(key in next)) out[key] = null;
  }
  return out;
}

// Deep structural equality over the JSON-shaped props payload (Fabric props are
// serializable: primitives, arrays, plain objects). Used to decide whether a
// node's props actually changed: `fabricProps` builds a fresh object each
// commit, so a reference check would report every node as dirty.
function propsEqual(a: IFabricProps, b: IFabricProps): boolean {
  return jsonEqual(a, b);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  const aArray = Array.isArray(a);
  const bArray = Array.isArray(b);
  if (aArray && bArray) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => jsonEqual(value, b[index]));
  }
  if (aArray || bArray) return false;
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(key => key in b && jsonEqual(a[key], b[key]));
}

// What Fabric currently holds for a node. The retained node carries the *desired*
// state (props/children); the mirror carries the *committed* state we diff against.
// `tag` is the reactTag we minted at first create, stable across clone-on-write
// (the clone keeps the family). Kept so the Animated native driver can bind to it
// (ADR 0017). `rootTag` lets a targeted re-commit (setNativeProps) find the surface.
interface IMirror {
  handle: IFabricNode;
  tag: number;
  rootTag: IRootTag;
  props: IFabricProps;
  children: readonly ISymbioteNode[];
  viewName: string;
}

const mirror = new WeakMap<ISymbioteNode, IMirror>();

interface IReconciled {
  handle: IFabricNode;
  changed: boolean;
}

function renderableChildren(node: ISymbioteNode): readonly ISymbioteNode[] {
  // Anchor nodes (Vue fragment/v-if/v-for placeholders) live in the retained tree for
  // sibling ordering but never become Fabric views, so drop them before emitting the child
  // set. Fast path: no anchors (every React tree, most Vue subtrees) reuses the array, so
  // the common case allocates nothing.
  return node.children.some(isAnchor)
    ? node.children.filter(child => !isAnchor(child))
    : node.children;
}

function childrenIdentical(
  kids: readonly ISymbioteNode[],
  committed: readonly ISymbioteNode[],
): boolean {
  if (kids.length !== committed.length) return false;
  return kids.every((child, index) => child === committed[index]);
}

// Diagnostic seam (gated): a ScrollView on Android must hold exactly ONE direct
// child (its content container), or the native mount aborts with "ScrollView can
// host only one direct child". Logged after children reconcile so each child's
// committed tag/view-name is resolved. A `MULTI!!` line names the exact extra
// node (tag + view-name) that pushed the scroll view past one child.
function logScrollChildren(node: ISymbioteNode, viewName: string, selfTag: number | string): void {
  if (!viewName.includes('Scroll') || viewName.includes('Content')) return;
  const kids = node.children.map(child => {
    const committed = mirror.get(child);
    return `${committed?.viewName ?? child.component}#${committed?.tag ?? 'NEW'}`;
  });
  const flag = kids.length === 1 ? 'OK' : 'MULTI!!';
  dlog(`SCROLL-${flag} ${viewName} tag=${selfTag} children(${kids.length})=[${kids.join(',')}]`);
}

function reconcile(
  slot: ReturnType<typeof getSlot>,
  node: ISymbioteNode,
  rootTag: IRootTag,
  hasTextAncestor: boolean,
): IReconciled {
  const viewName = viewNameFor(node, hasTextAncestor);
  const props = fabricProps(node);
  const childInText = node.isText || hasTextAncestor;
  const committed = mirror.get(node);
  // The children that actually reach Fabric. Anchors are filtered out here so the
  // whole walk (child-set emission, identity diff, mirror) is anchor-blind.
  const kids = renderableChildren(node);

  // First mount, or the view kind flipped (RCTText <-> RCTVirtualText when a
  // <Text> moves in or out of another <Text>): a different native component
  // can't be cloned across, so create a fresh node from scratch.
  if (committed === undefined || committed.viewName !== viewName) {
    stats.created += 1;
    const tag = nextTag();
    const handle = slot.createNode(tag, viewName, rootTag, props, node);
    for (const child of kids) {
      slot.appendChild(handle, reconcile(slot, child, rootTag, childInText).handle);
    }
    logScrollChildren(node, viewName, tag);
    mirror.set(node, { handle, tag, rootTag, props, children: kids.slice(), viewName });
    return { handle, changed: true };
  }

  // Reconcile children first; a child that re-cloned forces this node to re-clone
  // too, since Fabric parents point at specific child handles.
  const childHandles: IFabricNode[] = [];
  let descendantChanged = false;
  for (const child of kids) {
    const result = reconcile(slot, child, rootTag, childInText);
    childHandles.push(result.handle);
    if (result.changed) descendantChanged = true;
  }
  logScrollChildren(node, viewName, committed.tag);

  const childrenChanged = !childrenIdentical(kids, committed.children) || descendantChanged;
  const propsChanged = !propsEqual(committed.props, props);

  if (!childrenChanged && !propsChanged) {
    stats.reused += 1;
    return { handle: committed.handle, changed: false };
  }

  let handle: IFabricNode;
  if (childrenChanged) {
    stats.cloneChildren += 1;
    if (propsChanged) {
      const propsDiff = diffProps(committed.props, props);
      guardSerializable(propsDiff, viewName, committed.tag);
      handle = slot.cloneNodeWithNewChildrenAndProps(committed.handle, propsDiff);
    } else {
      handle = slot.cloneNodeWithNewChildren(committed.handle);
    }
    for (const childHandle of childHandles) {
      slot.appendChild(handle, childHandle);
    }
  } else {
    stats.cloneProps += 1;
    const propsDiff = diffProps(committed.props, props);
    guardSerializable(propsDiff, viewName, committed.tag);
    handle = slot.cloneNodeWithNewProps(committed.handle, propsDiff);
  }

  // The clone keeps the node's family, so its reactTag is unchanged; carry it.
  mirror.set(node, {
    handle,
    tag: committed.tag,
    rootTag,
    props,
    children: node.children.slice(),
    viewName,
  });
  return { handle, changed: true };
}

// One persistent synthetic root container per surface, mirroring RN's AppContainer
// (renderApplication wraps the app in `<View style={{flex:1}} pointerEvents="box-none">`).
// Without it a non-flex root view collapses to content height, and touches outside the
// app's children have no box-none escape. Keeping it here (not in each adapter's
// mount()) gives every framework a full-screen flex root for free and keeps layout in
// shared (adapters_stay_thin). The container is just another persistent node in the
// clone-on-write engine: stable identity, so an unchanged subtree leaves it un-cloned.
const ROOT_VIEW_COMPONENT = 'RCTView';
const ROOT_CONTAINER_STYLE = { flex: 1 };
const ROOT_CONTAINER_POINTER_EVENTS = 'box-none';

const rootContainers = new Map<IRootTag, ISymbioteNode>();

function rootContainerFor(rootTag: IRootTag): ISymbioteNode {
  let container = rootContainers.get(rootTag);
  if (container === undefined) {
    container = createElement(ROOT_VIEW_COMPONENT);
    container.props = {
      style: ROOT_CONTAINER_STYLE,
      pointerEvents: ROOT_CONTAINER_POINTER_EVENTS,
    };
    rootContainers.set(rootTag, container);
    dlog(`root container created root=${rootTag} (flex:1, box-none)`);
  }
  return container;
}

// Drop a surface's persistent root container so the NEXT mount on this rootTag starts
// from scratch (fresh tags, fresh mirror) instead of cloning handles that belonged to a
// now-stopped surface. Called from unmount (the bridgeless surface-stop path): the host stops then restarts a
// surface (Fast Refresh, focus/lifecycle) reusing the same rootTag, and a stale root
// container would re-clone dead handles into the new surface → a blank screen. The old
// container's descendants fall out of every reference and their mirror entries GC.
export function disposeRoot(rootTag: IRootTag): void {
  if (rootContainers.delete(rootTag)) dlog(`root container disposed root=${rootTag}`);
}

export function commitChildren(rootTag: IRootTag, children: readonly ISymbioteNode[]): void {
  // The wrapper holds the surface's top-level children; reconcile walks from it so the
  // whole tree, synthetic root included, goes through the same clone-on-write path.
  rootContainerFor(rootTag).children = children.slice();
  commitContainer(rootTag);
}

// Re-run the scoped commit for a surface from its synthetic root container, reusing
// whatever top-level children it currently holds. The shared half of the engine: both
// a full mutation→commit and a single-node Animated frame (setNativeProps) funnel here.
function commitContainer(rootTag: IRootTag): void {
  const slot = getSlot();
  const container = rootContainerFor(rootTag);

  stats.created = 0;
  stats.cloneProps = 0;
  stats.cloneChildren = 0;
  stats.reused = 0;
  // Entry seam: brackets reconcile with the `reconciled` line below. If `start` prints
  // but `reconciled` never does, the stall is inside reconcile (a JS loop/cycle in the
  // tree walk); if `start` itself never prints, the stall is upstream: React's commit
  // phase or the mutation ops before we are even called.
  dlog(`commit root=${rootTag} start children=${container.children.length}`);
  const result = reconcile(slot, container, rootTag, false);
  // Boundary seam: prints once reconcile returns. If a commit hangs and this line
  // never appears, the stall is inside reconcile (JS); if it appears but the
  // post-completeRoot line below never does, the stall is inside the native commit.
  dlog(`commit root=${rootTag} reconciled changed=${result.changed}`);

  // The container's identity is stable, so its un-cloned flag is the no-op signal:
  // an over-scheduled commit that touched nothing makes zero native calls.
  if (!result.changed) {
    dlog(`commit root=${rootTag} no-op (skipped completeRoot)`);
    return;
  }

  const childSet = slot.createChildSet(rootTag);
  slot.appendChildToSet(childSet, result.handle);
  dlog(`commit root=${rootTag} pre-completeRoot`);
  slot.completeRoot(rootTag, childSet);

  // Fresh Fabric tags are now assigned: let any consumer that needed a committed tag
  // and ran too early (the Animated native driver binding a props node to a view under
  // an async-batched commit) retry now. No-op when nothing is pending.
  runPostCommitHooks();

  if (isDebug()) {
    const mode = stats.created > 0 && stats.reused === 0 ? 'full' : 'incremental';
    dlog(
      `commit root=${rootTag} ${mode} ` +
        `created=${stats.created} cloneProps=${stats.cloneProps} ` +
        `cloneChildren=${stats.cloneChildren} reused=${stats.reused}`,
    );
  }
}

// Targeted per-frame prop write for the JS-driven Animated path (ADR 0016). RN
// flushes an animation frame with an in-place `instance.setNativeProps(...)`; we have
// no in-place mutation (Fabric is persistent), so a frame is one scoped commit: mutate
// the node's desired props, then re-reconcile its surface. The engine clones only this
// node (props differ), bubbles the re-clone to the root, reuses every sibling subtree
// by reference, and emits a single completeRoot. This is the "slow tier", viable for a
// single shallow animation; the native driver (ADR 0017) is the answer for scale.
export function setNativeProps(node: ISymbioteNode, partial: Record<string, unknown>): void {
  const record = mirror.get(node);
  if (record === undefined) {
    dlog('setNativeProps skipped: node not committed');
    return;
  }
  for (const [key, value] of Object.entries(partial)) {
    if (key === 'style') {
      // A partial style override MERGES onto the declarative style (RN semantics):
      // setNativeProps({style:{backgroundColor}}) recolors without dropping height
      // or radius. Transient: the next React commit re-applies the full style.
      node.props.style = { ...flattenStyle(node.props.style), ...flattenStyle(value) };
    } else {
      node.props[key] = value;
    }
  }
  dlog(`setNativeProps root=${record.rootTag} tag=${record.tag} keys=${Object.keys(partial)}`);
  commitContainer(record.rootTag);
}

// The committed reactTag of a node (stable across clone-on-write), for binding the
// Animated native driver via connectAnimatedNodeToView (ADR 0017). Undefined until the
// node has been committed at least once.
export function getNativeTag(node: ISymbioteNode): number | undefined {
  return mirror.get(node)?.tag;
}

// Actions waiting for their node's first commit. An adapter that wires an imperative/native call at
// lifecycle time (autoFocus, a native Animated.event attach) can run BEFORE completeRoot under an
// async-batched commit (Vue/Svelte schedule it on a microtask), so the node has no tag yet and the
// call silently no-ops. Each waiter retries after a commit may have assigned the tag and is dropped
// once it runs. React commits synchronously, so its actions run inline and never land here.
const pendingCommitWaiters = new Set<() => boolean>();
registerPostCommit(() => {
  for (const waiter of pendingCommitWaiters) {
    if (waiter()) pendingCommitWaiters.delete(waiter);
  }
});

// Run `action` once `node` has a committed Fabric tag — immediately if it already does, else after
// the commit that assigns it. The canonical fix for the Vue async-commit race: defer instead of
// silently no-opping. Returns a cancel fn (drop the pending retry, e.g. on unmount).
export function whenCommitted(node: ISymbioteNode, action: () => void): () => void {
  const attempt = (): boolean => {
    if (mirror.get(node) === undefined) return false;
    action();
    return true;
  };
  if (!attempt()) pendingCommitWaiters.add(attempt);
  return () => {
    pendingCommitWaiters.delete(attempt);
  };
}

// The node's current Fabric handle (the createNode/clone return value), identical in
// kind to React's stateNode.node, for the native driver's ShadowNodeFamily path.
export function getNativeNode(node: ISymbioteNode): IFabricNode | undefined {
  return mirror.get(node)?.handle;
}

// Imperative view command (e.g. TextInput's setTextAndSelection / focus / blur),
// aimed at a node's CURRENT Fabric handle. Only valid once the node has been
// committed at least once; its handle is read from the mirror.
export function dispatchViewCommand(
  node: ISymbioteNode,
  commandName: string,
  args: readonly unknown[],
): void {
  const record = mirror.get(node);
  if (record === undefined) {
    dlog(`dispatchViewCommand "${commandName}" skipped: node not committed`);
    return;
  }
  dlog(`dispatchViewCommand "${commandName}"`);
  getSlot().dispatchCommand(record.handle, commandName, args);
}

// Emit an accessibility event (focus/click/viewHoverEnter/windowStateChange) at a node's
// CURRENT Fabric handle, routed through the slot exactly like dispatchViewCommand. RN's
// Fabric path hands the public-instance handle to nativeFabricUIManager.sendAccessibilityEvent
// with the STRING eventType; the C++ side maps it to the platform's accessibility-event kind.
// A no-op (logged) until the node is committed; there is no handle yet.
export function sendAccessibilityEvent(node: ISymbioteNode, eventType: string): void {
  const record = mirror.get(node);
  if (record === undefined) {
    dlog(`sendAccessibilityEvent "${eventType}" skipped: node not committed`);
    return;
  }
  dlog(`sendAccessibilityEvent "${eventType}"`);
  getSlot().sendAccessibilityEvent(record.handle, eventType);
}

// Imperative measurement against a node's CURRENT Fabric handle (the public-instance
// measure family that reanimated / gesture-handler / scroll-to reach through). A
// no-op with a dlog until the node is committed; there is no handle to measure yet.
export function measure(node: ISymbioteNode, callback: IMeasureOnSuccess): void {
  const record = mirror.get(node);
  if (record === undefined) {
    dlog('measure skipped: node not committed');
    return;
  }
  getSlot().measure(record.handle, callback);
}

export function measureInWindow(node: ISymbioteNode, callback: IMeasureInWindowOnSuccess): void {
  const record = mirror.get(node);
  if (record === undefined) {
    dlog('measureInWindow skipped: node not committed');
    return;
  }
  getSlot().measureInWindow(record.handle, callback);
}

// Measure `node`'s frame relative to `relativeTo`. Both must be committed; RN's public
// signature is (relative, onSuccess, onFail) but the native slot wants the fail
// callback before success, so the order is swapped here.
export function measureLayout(
  node: ISymbioteNode,
  relativeTo: ISymbioteNode,
  onSuccess: IMeasureLayoutOnSuccess,
  onFail: () => void = () => {},
): void {
  const record = mirror.get(node);
  const relativeRecord = mirror.get(relativeTo);
  if (record === undefined || relativeRecord === undefined) {
    dlog('measureLayout skipped: a node is not committed');
    return;
  }
  getSlot().measureLayout(record.handle, relativeRecord.handle, onFail, onSuccess);
}
