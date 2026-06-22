// @symbiote/shared — the retained shadow-tree + clone-on-write commit engine.
// Every framework adapter drives this tiny mutation API; all Fabric-specific
// logic (tag allocation, view-name resolution, clone-on-write, event
// normalization) lives behind it, in one place.

export {
  createElement,
  createRawText,
  appendChild,
  insertBefore,
  removeChild,
  setProp,
  setEventListener,
  routeProp,
  setText,
  isSymbioteNode,
} from './node'
export { isEventFor } from './view-config'
export { registerComponent, setNativeViewConfigSource } from './registry'
// InteractionManager — pure JS (timers + emitter), framework-agnostic, so it lives
// here; every adapter re-exports it.
export { InteractionManager, Events as InteractionManagerEvents } from './interaction-manager'
export type {
  InteractionEvent,
  SimpleTask,
  PromiseTask,
  Task,
  Handle,
  Cancellable,
} from './interaction-manager'
export type {
  ComponentRegistration,
  NativeEventBinding,
  NativeViewConfig,
  NativeViewConfigSource,
  PropProcessor,
} from './registry'
export type { SymbioteNode, SymbioteEvent, Listener } from './node'

export { SymbioteSurface, createSurface } from './surface'
export { setEventDispatcher } from './dispatch'
export {
  setColorProcessor,
  dispatchViewCommand,
  setNativeProps,
  getNativeTag,
  getNativeNode,
  measure,
  measureInWindow,
  measureLayout,
} from './commit'
export { flattenStyle } from './style'
export { StyleSheet, computeHairlineWidth } from './style-sheet'
export { Platform } from './platform'
export type {
  PlatformStatic,
  PlatformOSType,
  PlatformConstantsIOS,
  PlatformSelectSpec,
} from './platform'
export { dlog, isDebug } from './debug'

export { getNativeModule, getEnforcingNativeModule } from './native-modules'
export { installDeviceEventHub, NativeEventEmitter, setDeviceEventSource } from './native-events'
export type {
  EventSubscription,
  EventEmitterModule,
  NativeEventListener,
  DeviceEventSource,
} from './native-events'

export {
  AnimatedNode,
  AnimatedWithChildren,
  AnimatedValue,
  AnimatedValueXY,
  AnimatedColor,
  AnimatedInterpolation,
  AnimatedAddition,
  AnimatedSubtraction,
  AnimatedMultiplication,
  AnimatedDivision,
  AnimatedModulo,
  AnimatedDiffClamp,
  AnimatedEvent,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  event,
  flushValue,
  Easing,
  createNumericInterpolation,
  checkValidRanges,
  TimingAnimation,
  SpringAnimation,
  DecayAnimation,
  AnimatedTracking,
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  nativeAnimated,
  isNativeAnimatedAvailable,
} from './animated'
export type {
  ValueXY,
  RgbaValue,
  ColorInput,
  EventConfig,
  AnimatedEventHandler,
  ValueListener,
  EasingFunction,
  InterpolationConfig,
  ExtrapolateType,
  Animation,
  EndCallback,
  EndResult,
  CompositeAnimation,
  TimingConfig,
  SpringConfig,
  DecayConfig,
  ParallelConfig,
  LoopAnimationConfig,
  NativeNodeConfig,
  NativeAnimationConfig,
  NativeEventMapping,
} from './animated'

export { getSlot } from './fabric'
export type {
  FabricSlot,
  FabricNode,
  FabricChildSet,
  FabricProps,
  FabricEventHandler,
  RootTag,
  MeasureOnSuccess,
  MeasureInWindowOnSuccess,
  MeasureLayoutOnSuccess,
} from './fabric'
