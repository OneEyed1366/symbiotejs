// DecayAnimation — ported from RN's animations/DecayAnimation.js, JS path only
// (ADR 0016). Models momentum bleeding off under friction: an initial velocity
// decays exponentially toward a resting value. Ends when consecutive frames
// move less than 0.1.

import type { Animation, EndCallback } from '../animation'
import type { AnimatedValue } from '../value'
import { dlog } from '../../debug'
import type { NativeAnimationConfig } from '../native/native-animated'
import { BaseAnimation, type AnimationConfig } from './base'
import { cancelFrame, requestFrame } from './raf'

export interface DecayAnimationConfig extends AnimationConfig {
  velocity: number
  deceleration?: number
}

export class DecayAnimation extends BaseAnimation {
  private startTime = 0
  private lastValue = 0
  private fromValue = 0
  private readonly deceleration: number
  private readonly velocity: number
  private onUpdate: (value: number) => void = () => {}
  private animationFrame: number | null = null

  constructor(config: DecayAnimationConfig) {
    super(config)
    this.deceleration = config.deceleration ?? 0.998
    this.velocity = config.velocity
  }

  protected override getNativeAnimationConfig(): NativeAnimationConfig {
    return {
      type: 'decay',
      deceleration: this.deceleration,
      velocity: this.velocity,
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
    this.lastValue = fromValue
    this.fromValue = fromValue
    this.onUpdate = onUpdate
    this.startTime = Date.now()
    if (this.startNativeIfNeeded(animatedValue)) return
    this.animationFrame = requestFrame(() => this.onFrame())
  }

  private onFrame(): void {
    const now = Date.now()
    const value =
      this.fromValue +
      (this.velocity / (1 - this.deceleration)) *
        (1 - Math.exp(-(1 - this.deceleration) * (now - this.startTime)))

    this.onUpdate(value)

    if (Math.abs(this.lastValue - value) < 0.1) {
      this.__notifyAnimationEnd({ finished: true })
      return
    }

    this.lastValue = value
    if (this.__active) {
      this.animationFrame = requestFrame(() => this.onFrame())
    }
  }

  override stop(): void {
    super.stop()
    if (this.animationFrame !== null) {
      cancelFrame(this.animationFrame)
      this.animationFrame = null
    }
    dlog('decay animation stopped')
    this.__notifyAnimationEnd({ finished: false })
  }
}
