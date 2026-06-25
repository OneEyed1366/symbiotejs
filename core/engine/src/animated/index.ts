// @symbiote/engine/animated — the framework-agnostic, JS-driven Animated engine
// (ADR 0016). The value graph, easing, interpolation and (Phase 2) drivers are
// pure JS with no React and no native dependency; every adapter re-exports them.

export { AnimatedNode, AnimatedWithChildren, flushValue, type ValueListener } from './graph'
export { AnimatedValue } from './value'
export { AnimatedValueXY, type ValueXY } from './value-xy'
export { AnimatedInterpolation } from './interpolation-node'
export {
  AnimatedAddition,
  AnimatedSubtraction,
  AnimatedMultiplication,
  AnimatedDivision,
  AnimatedModulo,
  AnimatedDiffClamp,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
} from './operators'
export {
  AnimatedEvent,
  event,
  forkEvent,
  unforkEvent,
  attachNativeEvent,
  type EventConfig,
  type EventListener,
  type AnimatedEventHandler,
  type NativeEventAttachment,
} from './event'
export { AnimatedColor, type RgbaValue, type ColorInput } from './color'
export { Easing, type EasingFunction } from './easing'
export {
  createNumericInterpolation,
  createInterpolation,
  checkValidRanges,
  type InterpolationConfig,
  type ExtrapolateType,
} from './interpolation'
export type { Animation, EndCallback, EndResult } from './animation'
export { TimingAnimation } from './animations/timing'
export { SpringAnimation } from './animations/spring'
export { DecayAnimation } from './animations/decay'
export { AnimatedTracking } from './animations/tracking'
export {
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  type CompositeAnimation,
  type TimingConfig,
  type SpringConfig,
  type DecayConfig,
  type ParallelConfig,
  type LoopAnimationConfig,
} from './animations/composition'
// The native-driver bridge (ADR 0017). Adapters need it to connect a props leaf to
// a host view tag and to restore default values on disconnect.
export {
  nativeAnimated,
  isNativeAnimatedAvailable,
  type NativeNodeConfig,
  type NativeAnimationConfig,
  type NativeEventMapping,
  type PlatformConfig,
} from './native/native-animated'
