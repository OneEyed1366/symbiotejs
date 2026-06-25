// Minimal driver base, ported from RN's animations/Animation.js with every
// native path removed (ADR 0016): no NativeAnimatedHelper, no
// __startAnimationIfNative, no shouldUseNativeDriver, no FeatureFlags. What
// remains is the JS-only contract — hold the end callback, track whether the
// animation is still active, and fire onEnd at most once.
//
// start() / stop() are abstract: each concrete driver (timing / spring / decay)
// owns its own requestAnimationFrame loop. They are declared as methods (not
// class fields) so a subclass override is not shadowed under
// useDefineForClassFields.

import type { Animation, EndCallback, EndResult } from '../animation'
import type { AnimatedValue } from '../value'
import { flushValue } from '../graph'
import { dlog, isDebug } from '../../debug'
import {
  generateNativeAnimationId,
  isNativeAnimatedAvailable,
  nativeAnimated,
  type NativeAnimationConfig,
  type PlatformConfig,
} from '../native/native-animated'

export interface AnimationConfig {
  isInteraction?: boolean
  iterations?: number
  // ADR 0017: offload the curve to the stock native module (zero JS per frame).
  // Honoured only when the module is present; otherwise the JS path runs.
  useNativeDriver?: boolean
  // RN threads both into every native animation config (Animation.js:30-34): the
  // platform bag rides through to native unread; debugID labels the animation in
  // native diagnostics. Optional — current callers pass nothing.
  platformConfig?: PlatformConfig
  debugID?: string
}

export abstract class BaseAnimation implements Animation {
  // `protected` so subclasses read it inside their rAF loop to decide whether to
  // schedule the next frame; cleared by stop().
  protected __active = false
  protected __iterations: number
  // RN's Animation holds `_platformConfig` / `__debugID` and folds them into the
  // native config (Animation.js:60-62). Subclasses read them via the protected
  // accessors below so every driver's config carries them uniformly.
  protected readonly __platformConfig: PlatformConfig | undefined
  private readonly __debugID: string | undefined

  private onEndCallback: EndCallback | null = null
  private readonly nativeDriverRequested: boolean
  private nativeId: number | undefined

  constructor(config: AnimationConfig) {
    this.__iterations = config.iterations ?? 1
    this.nativeDriverRequested = config.useNativeDriver === true
    this.__platformConfig = config.platformConfig
    this.__debugID = config.debugID
  }

  // Mirrors RN's Animation.__getDebugID (Animation.js:192). Returns the label only
  // under DEBUG so production native configs stay lean, undefined otherwise.
  protected __getDebugID(): string | undefined {
    return isDebug() ? this.__debugID : undefined
  }

  abstract start(
    fromValue: number,
    onUpdate: (value: number) => void,
    onEnd: EndCallback,
    previousAnimation: Animation | null,
    animatedValue: AnimatedValue,
  ): void

  // Subclasses call super.start(...) shape via this helper to wire the end
  // callback and arm the active flag before launching their loop.
  protected begin(onEnd: EndCallback): void {
    this.onEndCallback = onEnd
    this.__active = true
  }

  // A native driver overrides this with its curve config (`{type:'frames'|'spring'|'decay', …}`).
  protected getNativeAnimationConfig(): NativeAnimationConfig {
    throw new Error('This animation type cannot be offloaded to the native driver')
  }

  // If useNativeDriver was requested and the module is present, mirror the value
  // graph into native and hand the curve to native — the JS rAF loop is then
  // skipped entirely. Returns true when native took over. Falls back to JS (false)
  // when the module is missing (ADR 0016 path), so an app without RCTAnimation
  // still animates.
  protected startNativeIfNeeded(animatedValue: AnimatedValue): boolean {
    if (!this.nativeDriverRequested) return false
    if (!isNativeAnimatedAvailable()) {
      dlog('useNativeDriver requested but native animated module is missing; using JS driver')
      return false
    }
    const config = this.getNativeAnimationConfig()
    // RN hands the curve's platform bag down to the value node (Animation.js:137)
    // so the node's create config carries it too.
    animatedValue.__makeNative(this.__platformConfig)
    this.nativeId = generateNativeAnimationId()
    nativeAnimated.startAnimatingNode(
      this.nativeId,
      animatedValue.__getNativeTag(),
      config,
      (result) => {
        this.__notifyAnimationEnd({ finished: result.finished })
        // Sync the JS value to native's final value, then run leaf callbacks once.
        if (result.value !== undefined) {
          animatedValue.__onNativeUpdate(result.value, result.offset)
          flushValue(animatedValue)
        }
      },
    )
    return true
  }

  stop(): void {
    if (this.nativeId !== undefined) {
      nativeAnimated.stopAnimation(this.nativeId)
    }
    this.__active = false
  }

  // Fire the completion callback at most once. start() and stop() each run at
  // most once over an animation's life, and so does this.
  protected __notifyAnimationEnd(result: EndResult): void {
    const callback = this.onEndCallback
    if (callback !== null) {
      this.onEndCallback = null
      callback(result)
    }
  }
}
