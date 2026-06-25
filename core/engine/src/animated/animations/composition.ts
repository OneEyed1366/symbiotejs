// The driver factory + composition API, ported from RN's
// AnimatedImplementation.js, JS orchestration only (ADR 0016). `timing` /
// `spring` / `decay` wrap a value with a fresh driver and return a
// CompositeAnimation; `parallel` / `sequence` / `stagger` / `loop` / `delay`
// orchestrate those. Vector (XY/Color) handling, tracking, AnimatedEvent and
// every native-loop branch are dropped.

import type { EndCallback, EndResult } from '../animation'
import { dlog } from '../../debug'
import { isNativeAnimatedAvailable } from '../native/native-animated'
import { AnimatedNode } from '../graph'
import { AnimatedValue } from '../value'
import { AnimatedTracking } from './tracking'
import { TimingAnimation, type TimingAnimationConfig } from './timing'
import { SpringAnimation, type SpringAnimationConfig } from './spring'
import { DecayAnimation, type DecayAnimationConfig } from './decay'

// A started animation that can be stopped or reset. `start` takes an optional
// completion callback; `isLooping` is threaded through sequences so an inner
// timing knows it is part of an infinite loop.
export interface CompositeAnimation {
  start(callback?: EndCallback, isLooping?: boolean): void
  stop(): void
  reset(): void
  // Offload an N-iteration loop to the native driver: a single native animation
  // carries `iterations` in its config, so native runs the whole loop with ZERO JS
  // per cycle. Returns true when it took over. Present only on drivers that CAN
  // offload (a single timing/spring) — a sequence/parallel has no native loop, so
  // loop() falls back to JS restart. Internal (loop()'s use only).
  _nativeLoop?(iterations: number, callback?: EndCallback): boolean
}

// A loop offloads to native only when the driver was asked for the native path AND
// the module is present; otherwise the JS-restart loop must run (a JS timing runs
// once, it does not loop itself).
function canOffloadLoop(config: { useNativeDriver?: boolean }): boolean {
  return config.useNativeDriver === true && isNativeAnimatedAvailable()
}

interface WithOnComplete {
  onComplete?: EndCallback
}

// Fold a config's onComplete into the caller's callback so both fire. Mirrors
// RN's _combineCallbacks.
function combineCallbacks(
  callback: EndCallback | undefined,
  config: WithOnComplete,
): EndCallback | undefined {
  if (callback !== undefined && config.onComplete !== undefined) {
    const onComplete = config.onComplete
    return (result) => {
      onComplete(result)
      callback(result)
    }
  }
  return callback ?? config.onComplete
}

// `toValue` may be a moving target (another AnimatedNode): the driver still needs a
// concrete number, so the target is widened here at the composition layer and
// resolved per-launch by AnimatedTracking, while the driver config keeps toValue:number.
export type TimingConfig = Omit<TimingAnimationConfig, 'toValue'> & {
  toValue: number | AnimatedNode
} & WithOnComplete
export type SpringConfig = Omit<SpringAnimationConfig, 'toValue'> & {
  toValue: number | AnimatedNode
} & WithOnComplete
export type DecayConfig = DecayAnimationConfig & WithOnComplete

export function timing(value: AnimatedValue, config: TimingConfig): CompositeAnimation {
  return {
    start(callback?: EndCallback): void {
      const onEnd = combineCallbacks(callback, config)
      const target = config.toValue
      if (target instanceof AnimatedNode) {
        value.track(
          new AnimatedTracking(value, target, (toValue) => new TimingAnimation({ ...config, toValue }), onEnd),
        )
      } else {
        value.animate(new TimingAnimation({ ...config, toValue: target }), onEnd)
      }
    },
    stop(): void {
      value.stopAnimation()
    },
    reset(): void {
      value.resetAnimation()
    },
    _nativeLoop(iterations: number, callback?: EndCallback): boolean {
      const target = config.toValue
      if (target instanceof AnimatedNode || !canOffloadLoop(config)) return false
      // One native animation carrying `iterations` runs the loop in native; the
      // completion callback only fires when the count exhausts (never for -1).
      value.animate(
        new TimingAnimation({ ...config, toValue: target, iterations }),
        combineCallbacks(callback, config),
      )
      return true
    },
  }
}

export function spring(value: AnimatedValue, config: SpringConfig): CompositeAnimation {
  return {
    start(callback?: EndCallback): void {
      const onEnd = combineCallbacks(callback, config)
      const target = config.toValue
      if (target instanceof AnimatedNode) {
        value.track(
          new AnimatedTracking(value, target, (toValue) => new SpringAnimation({ ...config, toValue }), onEnd),
        )
      } else {
        value.animate(new SpringAnimation({ ...config, toValue: target }), onEnd)
      }
    },
    _nativeLoop(iterations: number, callback?: EndCallback): boolean {
      const target = config.toValue
      if (target instanceof AnimatedNode || !canOffloadLoop(config)) return false
      value.animate(
        new SpringAnimation({ ...config, toValue: target, iterations }),
        combineCallbacks(callback, config),
      )
      return true
    },
    stop(): void {
      value.stopAnimation()
    },
    reset(): void {
      value.resetAnimation()
    },
  }
}

export function decay(value: AnimatedValue, config: DecayConfig): CompositeAnimation {
  return {
    start(callback?: EndCallback): void {
      value.animate(new DecayAnimation(config), combineCallbacks(callback, config))
    },
    stop(): void {
      value.stopAnimation()
    },
    reset(): void {
      value.resetAnimation()
    },
  }
}

export interface ParallelConfig {
  // If one animation is stopped, stop all of them. Default: true.
  stopTogether?: boolean
}

export function parallel(
  animations: CompositeAnimation[],
  config?: ParallelConfig,
): CompositeAnimation {
  let doneCount = 0
  // Track per-animation completion so stop() calls each at most once.
  const hasEnded: Record<number, boolean> = {}
  const stopTogether = !(config !== undefined && config.stopTogether === false)

  const result: CompositeAnimation = {
    start(callback?: EndCallback, isLooping?: boolean): void {
      if (doneCount === animations.length) {
        callback?.({ finished: true })
        return
      }

      animations.forEach((animation, idx) => {
        const cb = (endResult: EndResult): void => {
          hasEnded[idx] = true
          doneCount++
          if (doneCount === animations.length) {
            doneCount = 0
            callback?.(endResult)
            return
          }
          if (!endResult.finished && stopTogether) {
            result.stop()
          }
        }
        animation.start(cb, isLooping)
      })
    },

    stop(): void {
      animations.forEach((animation, idx) => {
        if (!hasEnded[idx]) animation.stop()
        hasEnded[idx] = true
      })
    },

    reset(): void {
      animations.forEach((animation, idx) => {
        animation.reset()
        hasEnded[idx] = false
        doneCount = 0
      })
    },
  }

  return result
}

export function sequence(animations: CompositeAnimation[]): CompositeAnimation {
  let current = 0
  return {
    start(callback?: EndCallback, isLooping?: boolean): void {
      const onComplete = (result: EndResult): void => {
        if (!result.finished) {
          callback?.(result)
          return
        }
        current++
        if (current === animations.length) {
          // A fresh start (without reset) should begin from the top.
          current = 0
          callback?.(result)
          return
        }
        animations[current].start(onComplete, isLooping)
      }

      if (animations.length === 0) {
        callback?.({ finished: true })
      } else {
        animations[current].start(onComplete, isLooping)
      }
    },

    stop(): void {
      if (current < animations.length) {
        animations[current].stop()
      }
    },

    reset(): void {
      animations.forEach((animation, idx) => {
        if (idx <= current) animation.reset()
      })
      current = 0
    },
  }
}

export function delay(time: number): CompositeAnimation {
  return timing(new AnimatedValue(0), {
    toValue: 0,
    delay: time,
    duration: 0,
  })
}

export function stagger(time: number, animations: CompositeAnimation[]): CompositeAnimation {
  return parallel(
    animations.map((animation, i) => sequence([delay(time * i), animation])),
  )
}

export interface LoopAnimationConfig {
  iterations?: number
  resetBeforeIteration?: boolean
}

export function loop(
  animation: CompositeAnimation,
  config: LoopAnimationConfig = {},
): CompositeAnimation {
  const iterations = config.iterations ?? -1
  const resetBeforeIteration = config.resetBeforeIteration ?? true
  let isFinished = false
  let iterationsSoFar = 0
  return {
    start(callback?: EndCallback): void {
      if (iterations === 0) {
        callback?.({ finished: true })
        return
      }
      // Prefer the native loop: a single native animation runs all iterations in
      // native with zero JS per cycle. Only a single timing/spring offers it; a
      // sequence/parallel returns false (no _nativeLoop) and falls back to JS.
      if (animation._nativeLoop?.(iterations, callback) === true) {
        dlog(`loop: offloaded ${iterations} iterations to native`)
        return
      }
      const restart = (result: EndResult = { finished: true }): void => {
        if (isFinished || iterationsSoFar === iterations || result.finished === false) {
          callback?.(result)
        } else {
          iterationsSoFar++
          if (resetBeforeIteration) animation.reset()
          animation.start(restart, iterations === -1)
        }
      }
      restart()
    },

    stop(): void {
      isFinished = true
      animation.stop()
    },

    reset(): void {
      iterationsSoFar = 0
      isFinished = false
      animation.reset()
    },
  }
}
