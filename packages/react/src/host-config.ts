// react-reconciler host config in MUTATION mode. Every host operation maps onto
// shared's tiny mutation API; shared owns all Fabric-specific work (tag
// allocation, view-name resolution, clone-on-write, events). This is the
// canary: a known-good driver exercising shared end to end.

import createReconciler from 'react-reconciler'
import { createContext } from 'react'
import {
  appendChild,
  createElement,
  createRawText,
  insertBefore,
  removeChild,
  routeProp,
  setText,
  type SymbioteNode,
  type SymbioteSurface,
} from '@symbiote/shared'
import {
  DefaultEventPriority,
  DiscreteEventPriority,
  NoEventPriority,
} from './reconciler-constants'

type Props = Record<string, unknown>

interface HostContext {
  isInsideText: boolean
}

// Intrinsic JSX type -> Fabric component. Adding a primitive is one entry here
// plus its thin component in components.ts — no host-config logic per primitive.
interface ComponentDescriptor {
  component: string
  isText: boolean
}
const COMPONENTS: Readonly<Record<string, ComponentDescriptor>> = {
  'symbiote-view': { component: 'RCTView', isText: false },
  'symbiote-text': { component: 'RCTText', isText: true },
  'symbiote-image': { component: 'RCTImageView', isText: false },
  'symbiote-scroll-view': { component: 'RCTScrollView', isText: false },
  'symbiote-scroll-content': { component: 'RCTScrollContentView', isText: false },
  'symbiote-text-input': { component: 'RCTSinglelineTextInputView', isText: false },
  'symbiote-text-input-multiline': {
    component: 'RCTMultilineTextInputView',
    isText: false,
  },
  // Fabric component names are the codegen spec's first arg (the new-arch
  // registered name), not the legacy paperComponentName (RCTSwitch, …).
  'symbiote-switch': { component: 'Switch', isText: false },
  'symbiote-activity-indicator': { component: 'ActivityIndicatorView', isText: false },
  'symbiote-safe-area-view': { component: 'SafeAreaView', isText: false },
  'symbiote-modal': { component: 'ModalHostView', isText: false },
  'symbiote-refresh-control': { component: 'PullToRefreshView', isText: false },
  'symbiote-input-accessory-view': { component: 'RCTInputAccessoryView', isText: false },
}

function descriptorFor(type: string): ComponentDescriptor {
  const descriptor = COMPONENTS[type]
  if (descriptor !== undefined) return descriptor
  // A `symbiote-*` type with no entry is a typo in our own code — surface it.
  if (type.startsWith('symbiote-')) {
    throw new Error(`Unknown symbiote component type: ${type}`)
  }
  // Any other type is a raw Fabric view name straight from a library's codegen
  // component (`requireNativeComponent` returns the name string, so <RNCSlider/>
  // arrives here as 'RNCSlider'). It flows through untouched: shared derives its
  // events and processors from the view's ViewConfig — no per-library glue.
  return { component: type, isText: false }
}

function applyProps(node: SymbioteNode, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children') continue
    routeProp(node, key, value)
  }
}

function applyUpdate(node: SymbioteNode, oldProps: Props, newProps: Props): void {
  for (const key of Object.keys(oldProps)) {
    if (key === 'children') continue
    if (!Object.hasOwn(newProps, key)) routeProp(node, key, undefined)
  }
  for (const [key, value] of Object.entries(newProps)) {
    if (key === 'children') continue
    if (value !== oldProps[key]) routeProp(node, key, value)
  }
}

let currentUpdatePriority = NoEventPriority

// Run an externally-triggered update (a native event) at discrete priority so it
// lands on the sync lane and flushSyncWork paints it immediately.
export function withDiscretePriority(run: () => void): void {
  const previous = currentUpdatePriority
  currentUpdatePriority = DiscreteEventPriority
  try {
    run()
  } finally {
    currentUpdatePriority = previous
  }
}

const reconciler = createReconciler<
  string, // Type
  Props, // Props
  SymbioteSurface, // Container
  SymbioteNode, // Instance
  SymbioteNode, // TextInstance
  never, // SuspenseInstance
  unknown, // HydratableInstance
  unknown, // FormInstance
  SymbioteNode, // PublicInstance
  HostContext, // HostContext
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
    const isInsideText = descriptorFor(type).isText
    return parentHostContext.isInsideText === isInsideText
      ? parentHostContext
      : { isInsideText }
  },
  getPublicInstance: (instance) => instance,

  prepareForCommit: () => null,
  resetAfterCommit: (container) => {
    container.commit()
  },
  preparePortalMount: () => {},
  clearContainer: (container) => {
    container.clear()
  },

  shouldSetTextContent: () => false,

  createInstance(type, props, _container, hostContext) {
    const descriptor = descriptorFor(type)
    if (hostContext.isInsideText && !descriptor.isText) {
      throw new Error(`<${type}> can't be nested inside <Text>`)
    }
    const node = createElement(descriptor.component, descriptor.isText)
    applyProps(node, props)
    return node
  },
  createTextInstance(text, _container, hostContext) {
    if (!hostContext.isInsideText) {
      throw new Error(`Text string "${text}" must be rendered inside a <Text>`)
    }
    return createRawText(text)
  },

  appendInitialChild: (parent, child) => appendChild(parent, child),
  appendChild: (parent, child) => appendChild(parent, child),
  appendChildToContainer: (container, child) => container.appendChild(child),
  insertBefore: (parent, child, before) => insertBefore(parent, child, before),
  insertInContainerBefore: (container, child, before) =>
    container.insertBefore(child, before),
  removeChild: (parent, child) => removeChild(parent, child),
  removeChildFromContainer: (container, child) => container.removeChild(child),

  finalizeInitialChildren: () => false,
  commitUpdate(node, _type, oldProps, newProps) {
    applyUpdate(node, oldProps, newProps)
  },
  commitTextUpdate(node, _oldText, newText) {
    setText(node, newText)
  },

  resetTextContent: () => {},
  hideTextInstance: (node) => setText(node, ''),
  unhideTextInstance: (node, text) => setText(node, text),
  hideInstance: () => {},
  unhideInstance: () => {},

  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  detachDeletedInstance: () => {},
  getInstanceFromNode: () => null,
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,

  setCurrentUpdatePriority: (priority) => {
    currentUpdatePriority = priority
  },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () =>
    currentUpdatePriority !== NoEventPriority ? currentUpdatePriority : DefaultEventPriority,

  maySuspendCommit: () => false,
  NotPendingTransition: null,
  // react's Context IS the runtime value react-reconciler's ReactContext wants
  // (it reads _currentValue off it); the two libraries' type defs model
  // Consumer/Provider differently and cannot be reconciled structurally. This is
  // a type-def mismatch only — flagged here so a future @types fix forces cleanup.
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
})

export default reconciler
