// react-reconciler host config in MUTATION mode. Every host operation maps onto
// shared's tiny mutation API; shared owns all Fabric-specific work (tag
// allocation, view-name resolution, clone-on-write, events). This is the
// canary: a known-good driver exercising shared end to end.

import createReconciler from 'react-reconciler';
import { createContext } from 'react';
import {
  appendChild,
  createElement,
  createRawText,
  insertBefore,
  removeChild,
  routeProp,
  setText,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote/engine';
import {
  DefaultEventPriority,
  DiscreteEventPriority,
  NoEventPriority,
} from './reconciler-constants';
import { toPublicInstance, type IHostInstance } from './host-instance';
// Intrinsic JSX type -> Fabric component name. The name table + resolver live once in
// @symbiote/components, shared by every adapter so the names can't drift (one engine, one
// Fabric). The table is Metro-split (.ios/.android, filename selects, no Platform.OS read,
// per ADR 0020). Adding a primitive is one entry in each name table there, plus its thin
// component in components.ts: no host-config logic per primitive.
import { descriptorFor } from '@symbiote/components';

type IProps = Record<string, unknown>;

interface IHostContext {
  isInsideText: boolean;
}

// React-reserved prop keys that must never reach Fabric. `children` is the element
// tree (handled via appendChild). `ref`/`key` are React 19 plain props: the reconciler
// reads `props.ref` for commitAttachRef but does NOT strip it from the props it hands a
// host config, so `ref.current` (the public instance, a bag of methods like measure /
// focus) would serialize into folly::dynamic and throw "not convertible to dynamic" on
// Android. Stripping here is the host config's job, exactly as RN's own renderer does.
function isReservedProp(key: string): boolean {
  return key === 'children' || key === 'ref' || key === 'key';
}

function applyProps(node: ISymbioteNode, props: IProps): void {
  for (const [key, value] of Object.entries(props)) {
    if (isReservedProp(key)) continue;
    routeProp(node, key, value);
  }
}

function applyUpdate(node: ISymbioteNode, oldProps: IProps, newProps: IProps): void {
  for (const key of Object.keys(oldProps)) {
    if (isReservedProp(key)) continue;
    if (!Object.hasOwn(newProps, key)) routeProp(node, key, undefined);
  }
  for (const [key, value] of Object.entries(newProps)) {
    if (isReservedProp(key)) continue;
    if (value !== oldProps[key]) routeProp(node, key, value);
  }
}

// The reconciler's Container slot: the primary root (SymbioteSurface, from createContainer)
// OR a portal target (an already-mounted ISymbioteNode elsewhere in the SAME surface's tree —
// createPortal(children, node)). Mirrors the Vue renderer's identical IHostElement union.
type IContainer = SymbioteSurface | ISymbioteNode;

function isSurfaceContainer(container: IContainer): container is SymbioteSurface {
  return container instanceof SymbioteSurface;
}

let currentUpdatePriority = NoEventPriority;

// Run an externally-triggered update (a native event) at discrete priority so it
// lands on the sync lane and flushSyncWork paints it immediately.
export function withDiscretePriority(run: () => void): void {
  const previous = currentUpdatePriority;
  currentUpdatePriority = DiscreteEventPriority;
  try {
    run();
  } finally {
    currentUpdatePriority = previous;
  }
}

const reconciler = createReconciler<
  string, // Type
  IProps, // IProps
  IContainer, // Container
  ISymbioteNode, // Instance
  ISymbioteNode, // TextInstance
  never, // SuspenseInstance
  unknown, // HydratableInstance
  unknown, // FormInstance
  IHostInstance, // PublicInstance
  IHostContext, // IHostContext
  unknown, // ChildSet
  number, // TimeoutHandle
  number, // NoTimeout
  unknown // TransitionStatus
>({
  isPrimaryRenderer: true,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  noTimeout: -1,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,

  getRootHostContext: () => ({ isInsideText: false }),
  getChildHostContext(parentHostContext, type) {
    const isInsideText = descriptorFor(type).isText;
    return parentHostContext.isInsideText === isInsideText ? parentHostContext : { isInsideText };
  },
  getPublicInstance: instance => toPublicInstance(instance),

  prepareForCommit: () => null,
  // Called once per commit with the PRIMARY root's own container only — never with a portal's
  // target (portal mutations recommit as part of the same surface's tree walk, since the target
  // must be a node already inside that surface; see create-portal.ts).
  resetAfterCommit: container => {
    if (isSurfaceContainer(container)) container.commit();
  },
  preparePortalMount: () => {},
  clearContainer: container => {
    if (isSurfaceContainer(container)) container.clear();
  },

  shouldSetTextContent: () => false,

  createInstance(type, props, _container, hostContext) {
    const descriptor = descriptorFor(type);
    if (hostContext.isInsideText && !descriptor.isText) {
      throw new Error(`<${type}> can't be nested inside <Text>`);
    }
    const node = createElement(descriptor.component, descriptor.isText);
    applyProps(node, props);
    return node;
  },
  createTextInstance(text, _container, hostContext) {
    if (!hostContext.isInsideText) {
      throw new Error(`Text string "${text}" must be rendered inside a <Text>`);
    }
    return createRawText(text);
  },

  appendInitialChild: (parent, child) => appendChild(parent, child),
  appendChild: (parent, child) => appendChild(parent, child),
  appendChildToContainer: (container, child) => {
    if (isSurfaceContainer(container)) container.appendChild(child);
    else appendChild(container, child);
  },
  insertBefore: (parent, child, before) => insertBefore(parent, child, before),
  insertInContainerBefore: (container, child, before) => {
    if (isSurfaceContainer(container)) container.insertBefore(child, before);
    else insertBefore(container, child, before);
  },
  removeChild: (parent, child) => removeChild(parent, child),
  removeChildFromContainer: (container, child) => {
    if (isSurfaceContainer(container)) container.removeChild(child);
    else removeChild(container, child);
  },

  finalizeInitialChildren: () => false,
  commitUpdate(node, _type, oldProps, newProps) {
    applyUpdate(node, oldProps, newProps);
  },
  commitTextUpdate(node, _oldText, newText) {
    setText(node, newText);
  },

  resetTextContent: () => {},
  hideTextInstance: node => setText(node, ''),
  unhideTextInstance: (node, text) => setText(node, text),
  hideInstance: () => {},
  unhideInstance: () => {},

  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  detachDeletedInstance: () => {},
  getInstanceFromNode: () => null,
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,

  setCurrentUpdatePriority: priority => {
    currentUpdatePriority = priority;
  },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () =>
    currentUpdatePriority !== NoEventPriority ? currentUpdatePriority : DefaultEventPriority,

  maySuspendCommit: () => false,
  NotPendingTransition: null,
  // react's Context IS the runtime value react-reconciler's ReactContext wants
  // (it reads _currentValue off it); the two libraries' type defs model
  // Consumer/Provider differently and cannot be reconciled structurally. This is
  // a type-def mismatch only, flagged here so a future @types fix forces cleanup.
  // @ts-expect-error cross-library Context type-def mismatch (runtime-correct)
  HostTransitionContext: createContext<unknown>(null),
  resetFormInstance: () => {},
  requestPostPaintCallback: () => {},
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
});

export default reconciler;
