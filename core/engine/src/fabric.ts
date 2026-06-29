// The one seam symbiote drives. `global.nativeFabricUIManager` is the
// framework-agnostic, JSI-bound mutation API that Fabric exposes; React's
// renderer is just one client of it. We bind to it directly.
//
// The live object is a lazy caching proxy: every property access mints a fresh
// host function, so we read each method once and cache a plain facade.

import { dlog } from './debug';

export type IRootTag = number;

// Opaque native handles. We never construct these: the slot mints and returns
// them. The phantom brand fields make the two handle kinds non-interchangeable
// and stop a raw object being passed where a handle is expected.
export interface IFabricNode {
  readonly __fabricNode: unique symbol;
}
export interface IFabricChildSet {
  readonly __fabricChildSet: unique symbol;
}

export type IFabricProps = Record<string, unknown>;

export type IFabricEventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void;

// Measurement callbacks, matching Fabric's native signatures (ReactNativeElement's
// measure family). `measure` reports the on-screen frame plus page offset;
// `measureInWindow` the window-relative frame; `measureLayout` the frame relative to
// another node. Libraries (reanimated, gesture-handler, scroll-to) read these.
export type IMeasureOnSuccess = (
  x: number,
  y: number,
  width: number,
  height: number,
  pageX: number,
  pageY: number,
) => void;
export type IMeasureInWindowOnSuccess = (
  x: number,
  y: number,
  width: number,
  height: number,
) => void;
export type IMeasureLayoutOnSuccess = (
  left: number,
  top: number,
  width: number,
  height: number,
) => void;

export interface IFabricSlot {
  createNode(
    reactTag: number,
    viewName: string,
    rootTag: IRootTag,
    props: IFabricProps,
    instanceHandle: unknown,
  ): IFabricNode;
  cloneNodeWithNewProps(node: IFabricNode, newProps: IFabricProps): IFabricNode;
  cloneNodeWithNewChildren(node: IFabricNode): IFabricNode;
  cloneNodeWithNewChildrenAndProps(node: IFabricNode, newProps: IFabricProps): IFabricNode;
  createChildSet(rootTag: IRootTag): IFabricChildSet;
  appendChild(parent: IFabricNode, child: IFabricNode): IFabricNode;
  appendChildToSet(childSet: IFabricChildSet, child: IFabricNode): void;
  completeRoot(rootTag: IRootTag, childSet: IFabricChildSet): void;
  registerEventHandler(handler: IFabricEventHandler): void;
  // Imperative view commands (e.g. TextInput setTextAndSelection, focus, blur).
  dispatchCommand(node: IFabricNode, commandName: string, args: readonly unknown[]): void;
  // Emit an accessibility event (focus/click/…) at a node's CURRENT Fabric handle.
  // RN's Fabric binding passes the public-instance handle straight here; the C++ side
  // maps the string eventType to the platform's accessibility-event kind.
  sendAccessibilityEvent(node: IFabricNode, eventType: string): void;
  // Imperative measurement, against a node's CURRENT (committed) Fabric handle.
  measure(node: IFabricNode, callback: IMeasureOnSuccess): void;
  measureInWindow(node: IFabricNode, callback: IMeasureInWindowOnSuccess): void;
  measureLayout(
    node: IFabricNode,
    relativeToNode: IFabricNode,
    onFail: () => void,
    onSuccess: IMeasureLayoutOnSuccess,
  ): void;
}

// The JSI global, typed at the trust boundary. RN's InitializeCore installs it
// on Fabric hosts; it is absent on the legacy (Paper) architecture. Declaring
// its type here is how host globals are typed (cf. `window` in lib.dom): the
// single point where we vouch for the native contract, with no per-call cast.
// Accessed via globalThis to match how RN itself reads it (global.nativeFabricUIManager).
declare global {
  var nativeFabricUIManager: IFabricSlot | undefined;
}

let cached: IFabricSlot | undefined;

export function getSlot(): IFabricSlot {
  if (cached) return cached;

  const host = globalThis.nativeFabricUIManager;
  if (host === undefined) {
    throw new Error(
      'nativeFabricUIManager is not installed on the global. ' +
        'Is this running on a Fabric (New Architecture) host with InitializeCore loaded?',
    );
  }

  // Read each method exactly once: the live binding re-mints host functions on
  // every property access, so caching the references avoids that churn.
  const { createNode } = host;
  const { cloneNodeWithNewProps } = host;
  const { cloneNodeWithNewChildren } = host;
  const { cloneNodeWithNewChildrenAndProps } = host;
  const { createChildSet } = host;
  const { appendChild } = host;
  const { appendChildToSet } = host;
  const { completeRoot } = host;
  const { registerEventHandler } = host;
  const { dispatchCommand } = host;
  // Optional on some hosts: read it off the live binding and feature-detect below so an
  // older slot without it degrades to a logged no-op instead of throwing.
  const { sendAccessibilityEvent } = host;
  const { measure } = host;
  const { measureInWindow } = host;
  const { measureLayout } = host;

  cached = {
    createNode: (reactTag, viewName, rootTag, props, instanceHandle) =>
      createNode(reactTag, viewName, rootTag, props, instanceHandle),
    cloneNodeWithNewProps: (node, newProps) => cloneNodeWithNewProps(node, newProps),
    cloneNodeWithNewChildren: node => cloneNodeWithNewChildren(node),
    cloneNodeWithNewChildrenAndProps: (node, newProps) =>
      cloneNodeWithNewChildrenAndProps(node, newProps),
    createChildSet: rootTag => createChildSet(rootTag),
    appendChild: (parent, child) => appendChild(parent, child),
    appendChildToSet: (childSet, child) => appendChildToSet(childSet, child),
    completeRoot: (rootTag, childSet) => completeRoot(rootTag, childSet),
    registerEventHandler: handler => registerEventHandler(handler),
    dispatchCommand: (node, commandName, args) => dispatchCommand(node, commandName, args),
    sendAccessibilityEvent: (node, eventType) => {
      if (typeof sendAccessibilityEvent !== 'function') {
        dlog(`sendAccessibilityEvent("${eventType}") -> host lacks the method (no-op)`);
        return;
      }
      sendAccessibilityEvent(node, eventType);
    },
    measure: (node, callback) => measure(node, callback),
    measureInWindow: (node, callback) => measureInWindow(node, callback),
    measureLayout: (node, relativeToNode, onFail, onSuccess) =>
      measureLayout(node, relativeToNode, onFail, onSuccess),
  };
  dlog('slot bound to nativeFabricUIManager');
  return cached;
}
