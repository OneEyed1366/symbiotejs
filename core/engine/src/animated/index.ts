// @symbiote-native/engine/animated: the framework-agnostic, JS-driven Animated engine.
// The value graph, easing, interpolation and drivers are pure JS with no React
// and no native dependency; every adapter re-exports them.

export { AnimatedNode, AnimatedWithChildren, flushValue, type IValueListener } from './graph';
export { AnimatedValue } from './value';
export { AnimatedValueXY, type IValueXY } from './value-xy';
export { AnimatedInterpolation } from './interpolation-node';
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
} from './operators';
export {
  AnimatedEvent,
  event,
  forkEvent,
  unforkEvent,
  attachNativeEvent,
  attachNativeEventHandler,
  type IEventConfig,
  type IEventListener,
  type IAnimatedEventHandler,
  type INativeEventAttachment,
} from './event';
export { AnimatedColor, type IRgbaValue, type IColorInput } from './color';
export { Easing, type IEasingFunction } from './easing';
export {
  createNumericInterpolation,
  createInterpolation,
  checkValidRanges,
  type IInterpolationConfig,
  type IExtrapolateType,
} from './interpolation';
export type { IAnimation, IEndCallback, IEndResult } from './animation';
export { TimingAnimation } from './animations/timing';
export { SpringAnimation } from './animations/spring';
export { DecayAnimation } from './animations/decay';
export { AnimatedTracking } from './animations/tracking';
export {
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  type ICompositeAnimation,
  type ITimingConfig,
  type ISpringConfig,
  type IDecayConfig,
  type IParallelConfig,
  type ILoopAnimationConfig,
} from './animations/composition';
// The native-driver bridge. Adapters need it to connect a props leaf to
// a host view tag and to restore default values on disconnect.
export {
  nativeAnimated,
  isNativeAnimatedAvailable,
  type INativeNodeConfig,
  type INativeAnimationConfig,
  type INativeEventMapping,
  type IPlatformConfig,
} from './native/native-animated';
// The pure graph leaves and the mock, framework-agnostic (extend AnimatedWithChildren,
// no React/Vue). They live here with the rest of the graph; every adapter's
// createAnimatedComponent + Animated namespace re-exports them.
export { AnimatedProps } from './props';
export { AnimatedStyle, AnimatedTransform } from './style';
export { AnimatedMock } from './mock';
// Framework-agnostic createAnimatedComponent helpers. Both adapters import them.
export { reduceProps, isAnimatedNode, readPassthroughStyle, resolveHostNode } from './shared';
