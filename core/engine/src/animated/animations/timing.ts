// TimingAnimation — ported from RN's animations/TimingAnimation.js, JS path
// only (ADR 0016). Walks a value from `fromValue` to `toValue` over `duration`
// ms, shaping progress through an easing function. The native-frame export and
// __startAnimationIfNative branch are dropped.

import type { Animation, EndCallback } from '../animation'
import type { AnimatedValue } from '../value'
import { Easing, type EasingFunction } from '../easing'
import { dlog } from '../../debug'
import type { NativeAnimationConfig } from '../native/native-animated'
import { BaseAnimation, type AnimationConfig } from './base'
import { cancelFrame, clearTimer, requestFrame, setTimer, type TimerHandle } from './raf'

export interface TimingAnimationConfig extends AnimationConfig {
  toValue: number
  easing?: EasingFunction
  duration?: number
  delay?: number
}

let cachedEaseInOut: EasingFunction | undefined
function easeInOut(): EasingFunction {
  if (cachedEaseInOut === undefined) {
    cachedEaseInOut = Easing.inOut(Easing.ease)
  }
  return cachedEaseInOut
}

export class TimingAnimation extends BaseAnimation {
  private startTime = 0
  private fromValue = 0
  private readonly toValue: number
  private readonly duration: number
  private readonly delay: number
  private readonly easing: EasingFunction
  private onUpdate: (value: number) => void = () => {}
  private animationFrame: number | null = null
  private timeout: TimerHandle | null = null

  constructor(config: TimingAnimationConfig) {
    super(config)
    this.toValue = config.toValue
    this.easing = config.easing ?? easeInOut()
    this.duration = config.duration ?? 500
    this.delay = config.delay ?? 0
  }

  // Native: hand the easing curve to native as a per-frame sample table.
  protected override getNativeAnimationConfig(): NativeAnimationConfig {
    const frameDuration = 1000 / 60
    const numFrames = Math.round(this.duration / frameDuration)
    const frames: number[] = []
    for (let frame = 0; frame < numFrames; frame++) {
      frames.push(this.easing(frame / numFrames))
    }
    frames.push(this.easing(1))
    return {
      type: 'frames',
      frames,
      toValue: this.toValue,
      iterations: this.__iterations,
      platformConfig: this.__platformConfig,
      debugID: this.__getDebugID(),
    }
  }

  override start(
    fromValue: number,
    onUpdate: (value: number) => void,
    onEnd: EndCallback,
    _previousAnimation: Animation | null,
    animatedValue: AnimatedValue,
  ): void {
    this.begin(onEnd)
    this.fromValue = fromValue
    this.onUpdate = onUpdate

    const begin = (): void => {
      this.startTime = Date.now()
      // Native took over → the JS rAF loop is skipped entirely.
      if (this.startNativeIfNeeded(animatedValue)) return
      if (this.duration === 0) {
        this.onUpdate(this.toValue)
        this.__notifyAnimationEnd({ finished: true })
      } else {
        this.animationFrame = requestFrame(() => this.onFrame())
      }
    }

    if (this.delay !== 0) {
      this.timeout = setTimer(begin, this.delay)
    } else {
      begin()
    }
  }

  private onFrame(): void {
    const now = Date.now()
    if (now >= this.startTime + this.duration) {
      this.onUpdate(this.fromValue + this.easing(1) * (this.toValue - this.fromValue))
      this.__notifyAnimationEnd({ finished: true })
      return
    }

    this.onUpdate(
      this.fromValue +
        this.easing((now - this.startTime) / this.duration) * (this.toValue - this.fromValue),
    )
    if (this.__active) {
      this.animationFrame = requestFrame(() => this.onFrame())
    }
  }

  override stop(): void {
    super.stop()
    if (this.timeout !== null) {
      clearTimer(this.timeout)
      this.timeout = null
    }
    if (this.animationFrame !== null) {
      cancelFrame(this.animationFrame)
      this.animationFrame = null
    }
    dlog('timing animation stopped')
    this.__notifyAnimationEnd({ finished: false })
  }
}
