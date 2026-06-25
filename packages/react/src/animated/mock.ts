// AnimatedMock — ported from RN's AnimatedMock.js. When the host reports
// Platform.isDisableAnimations (reduced-motion accessibility setting, or a test
// environment), RN swaps the whole Animated namespace for this mock: the surface
// is identical but every animation jumps straight to its final value and fires the
// end callback synchronously, with no frames. Snapshot tests and reduced-motion
// users get the resting state without flake. The value graph, operators, easing,
// events and createAnimatedComponent are reused verbatim from the live engine —
// only the driver factories (timing/spring/decay) and compositions are mocked.

import {
  AnimatedValue,
  AnimatedValueXY,
  AnimatedColor,
  AnimatedNode,
  Easing,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  event,
  forkEvent,
  unforkEvent,
  dlog,
  type EndCallback,
  type EndResult,
  type CompositeAnimation,
  type TimingConfig,
  type SpringConfig,
  type DecayConfig,
  type ParallelConfig,
} from '@symbiote/shared'

// Prevent a callback invocation from recursively triggering another callback,
// which may trigger another animation (RN's AnimatedMock.js:36-60).
let inAnimationCallback = false
function mockAnimationStart(
  start: (callback?: EndCallback) => void,
): (callback?: EndCallback) => void {
  return (callback) => {
    const guardedCallback =
      callback === undefined
        ? callback
        : (result: EndResult): void => {
            if (inAnimationCallback) {
              dlog('Ignoring recursive animation callback when running mock animations')
              return
            }
            inAnimationCallback = true
            try {
              callback(result)
            } finally {
              inAnimationCallback = false
            }
          }
    start(guardedCallback)
  }
}

const emptyAnimation: CompositeAnimation = {
  start: () => {},
  stop: () => {},
  reset: () => {},
}

function mockCompositeAnimation(animations: CompositeAnimation[]): CompositeAnimation {
  return {
    ...emptyAnimation,
    start: mockAnimationStart((callback) => {
      animations.forEach((animation) => animation.start())
      callback?.({ finished: true })
    }),
  }
}

// `toValue` is widened to `number | AnimatedNode` at the composition layer; the
// mock needs a concrete number to land on, so resolve a node target to its current
// value (RN reaches the same number through `anyValue`).
function resolveToValue(toValue: number | AnimatedNode): number {
  if (toValue instanceof AnimatedNode) {
    const current = toValue.__getValue()
    return typeof current === 'number' ? current : 0
  }
  return toValue
}

function spring(value: AnimatedValue, config: SpringConfig): CompositeAnimation {
  return {
    ...emptyAnimation,
    start: mockAnimationStart((callback) => {
      value.setValue(resolveToValue(config.toValue))
      callback?.({ finished: true })
    }),
  }
}

function timing(value: AnimatedValue, config: TimingConfig): CompositeAnimation {
  return {
    ...emptyAnimation,
    start: mockAnimationStart((callback) => {
      value.setValue(resolveToValue(config.toValue))
      callback?.({ finished: true })
    }),
  }
}

// Decay has no toValue to land on — RN returns the empty animation (AnimatedMock.js:121).
function decay(_value: AnimatedValue, _config: DecayConfig): CompositeAnimation {
  return emptyAnimation
}

function sequence(animations: CompositeAnimation[]): CompositeAnimation {
  return mockCompositeAnimation(animations)
}

function parallel(animations: CompositeAnimation[], _config?: ParallelConfig): CompositeAnimation {
  return mockCompositeAnimation(animations)
}

function delay(_time: number): CompositeAnimation {
  return emptyAnimation
}

function stagger(_time: number, animations: CompositeAnimation[]): CompositeAnimation {
  return mockCompositeAnimation(animations)
}

function loop(_animation: CompositeAnimation): CompositeAnimation {
  return emptyAnimation
}

// The mocked namespace surface. The animation factories above resolve immediately;
// everything else (value nodes, operators, easing, events) is the real engine. The
// animated components are spread in by the caller (animated/index.ts) so this file
// stays free of the createAnimatedComponent / TDZ-sensitive container wrapping.
export const AnimatedMock = {
  Value: AnimatedValue,
  ValueXY: AnimatedValueXY,
  Color: AnimatedColor,
  Easing,
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  event,
  forkEvent,
  unforkEvent,
}
