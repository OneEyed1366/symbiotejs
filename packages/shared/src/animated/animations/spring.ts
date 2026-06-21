// SpringAnimation — ported from RN's animations/SpringAnimation.js, JS path
// only (ADR 0016). Integrates the closed form of a damped harmonic oscillator
// each frame and rests once both velocity and displacement fall below their
// thresholds. A spring chained after a previous spring inherits its
// position/velocity/time (getInternalState) so retargeting mid-flight stays
// continuous. The native-config export is dropped.

import type { Animation, EndCallback } from '../animation'
import type { AnimatedValue } from '../value'
import { dlog } from '../../debug'
import type { NativeAnimationConfig } from '../native/native-animated'
import { BaseAnimation, type AnimationConfig } from './base'
import { cancelFrame, clearTimer, requestFrame, setTimer, type TimerHandle } from './raf'
import { fromBouncinessAndSpeed, fromOrigamiTensionAndFriction } from './spring-config'

export interface SpringAnimationConfig extends AnimationConfig {
  toValue: number
  overshootClamping?: boolean
  restDisplacementThreshold?: number
  restSpeedThreshold?: number
  velocity?: number
  bounciness?: number
  speed?: number
  tension?: number
  friction?: number
  stiffness?: number
  damping?: number
  mass?: number
  delay?: number
}

interface SpringInternalState {
  lastPosition: number
  lastVelocity: number
  lastTime: number
}

function resolveStiffnessDampingMass(config: SpringAnimationConfig): {
  stiffness: number
  damping: number
  mass: number
} {
  if (config.stiffness !== undefined || config.damping !== undefined || config.mass !== undefined) {
    return {
      stiffness: config.stiffness ?? 100,
      damping: config.damping ?? 10,
      mass: config.mass ?? 1,
    }
  }
  if (config.bounciness !== undefined || config.speed !== undefined) {
    const springConfig = fromBouncinessAndSpeed(config.bounciness ?? 8, config.speed ?? 12)
    return { stiffness: springConfig.stiffness, damping: springConfig.damping, mass: 1 }
  }
  const springConfig = fromOrigamiTensionAndFriction(config.tension ?? 40, config.friction ?? 7)
  return { stiffness: springConfig.stiffness, damping: springConfig.damping, mass: 1 }
}

export class SpringAnimation extends BaseAnimation {
  private readonly overshootClamping: boolean
  private readonly restDisplacementThreshold: number
  private readonly restSpeedThreshold: number
  private lastVelocity: number
  private startPosition = 0
  private lastPosition = 0
  private readonly toValue: number
  private readonly stiffness: number
  private readonly damping: number
  private readonly mass: number
  private initialVelocity: number
  private readonly delay: number
  private lastTime = 0
  private frameTime = 0
  private onUpdate: (value: number) => void = () => {}
  private animationFrame: number | null = null
  private timeout: TimerHandle | null = null

  constructor(config: SpringAnimationConfig) {
    super(config)
    this.overshootClamping = config.overshootClamping ?? false
    this.restDisplacementThreshold = config.restDisplacementThreshold ?? 0.001
    this.restSpeedThreshold = config.restSpeedThreshold ?? 0.001
    this.initialVelocity = config.velocity ?? 0
    this.lastVelocity = config.velocity ?? 0
    this.toValue = config.toValue
    this.delay = config.delay ?? 0

    const resolved = resolveStiffnessDampingMass(config)
    if (resolved.stiffness <= 0) throw new Error('Stiffness value must be greater than 0')
    if (resolved.damping <= 0) throw new Error('Damping value must be greater than 0')
    if (resolved.mass <= 0) throw new Error('Mass value must be greater than 0')
    this.stiffness = resolved.stiffness
    this.damping = resolved.damping
    this.mass = resolved.mass
  }

  getInternalState(): SpringInternalState {
    return {
      lastPosition: this.lastPosition,
      lastVelocity: this.lastVelocity,
      lastTime: this.lastTime,
    }
  }

  // Native: hand the oscillator parameters to native (QuartzCore CASpringAnimation).
  protected override getNativeAnimationConfig(): NativeAnimationConfig {
    return {
      type: 'spring',
      stiffness: this.stiffness,
      damping: this.damping,
      mass: this.mass,
      initialVelocity: this.initialVelocity,
      overshootClamping: this.overshootClamping,
      restDisplacementThreshold: this.restDisplacementThreshold,
      restSpeedThreshold: this.restSpeedThreshold,
      toValue: this.toValue,
      iterations: this.__iterations,
    }
  }

  override start(
    fromValue: number,
    onUpdate: (value: number) => void,
    onEnd: EndCallback,
    previousAnimation: Animation | null,
    animatedValue: AnimatedValue,
  ): void {
    this.begin(onEnd)
    this.startPosition = fromValue
    this.lastPosition = this.startPosition
    this.onUpdate = onUpdate
    this.lastTime = Date.now()
    this.frameTime = 0

    if (previousAnimation instanceof SpringAnimation) {
      const internalState = previousAnimation.getInternalState()
      this.lastPosition = internalState.lastPosition
      this.lastVelocity = internalState.lastVelocity
      this.initialVelocity = this.lastVelocity
      this.lastTime = internalState.lastTime
    }

    // Native took over → the JS rAF loop is skipped entirely.
    if (this.startNativeIfNeeded(animatedValue)) return

    if (this.delay !== 0) {
      this.timeout = setTimer(() => this.onFrame(), this.delay)
    } else {
      this.onFrame()
    }
  }

  // This spring model is based off of a damped harmonic oscillator
  // (https://en.wikipedia.org/wiki/Harmonic_oscillator#Damped_harmonic_oscillator),
  // using the closed form of the second-order differential equation. It matches
  // the algorithm used by QuartzCore's CASpringAnimation.
  private onFrame(): void {
    // If a lot of frames were lost (a large payload, a paused debugger) advance
    // by at most 4 frames so the spring keeps running fast rather than jumping
    // to the end.
    const MAX_STEPS = 64
    let now = Date.now()
    if (now > this.lastTime + MAX_STEPS) {
      now = this.lastTime + MAX_STEPS
    }

    const deltaTime = (now - this.lastTime) / 1000
    this.frameTime += deltaTime

    const c = this.damping
    const m = this.mass
    const k = this.stiffness
    const v0 = -this.initialVelocity

    const zeta = c / (2 * Math.sqrt(k * m))
    const omega0 = Math.sqrt(k / m)
    const omega1 = omega0 * Math.sqrt(1.0 - zeta * zeta)
    const x0 = this.toValue - this.startPosition

    let position = 0.0
    let velocity = 0.0
    const t = this.frameTime
    if (zeta < 1) {
      // Under-damped.
      const envelope = Math.exp(-zeta * omega0 * t)
      position =
        this.toValue -
        envelope *
          (((v0 + zeta * omega0 * x0) / omega1) * Math.sin(omega1 * t) +
            x0 * Math.cos(omega1 * t))
      velocity =
        zeta *
          omega0 *
          envelope *
          ((Math.sin(omega1 * t) * (v0 + zeta * omega0 * x0)) / omega1 +
            x0 * Math.cos(omega1 * t)) -
        envelope *
          (Math.cos(omega1 * t) * (v0 + zeta * omega0 * x0) - omega1 * x0 * Math.sin(omega1 * t))
    } else {
      // Critically damped.
      const envelope = Math.exp(-omega0 * t)
      position = this.toValue - envelope * (x0 + (v0 + omega0 * x0) * t)
      velocity = envelope * (v0 * (t * omega0 - 1) + t * x0 * (omega0 * omega0))
    }

    this.lastTime = now
    this.lastPosition = position
    this.lastVelocity = velocity

    this.onUpdate(position)
    if (!this.__active) {
      // A listener may have stopped us inside onUpdate.
      return
    }

    let isOvershooting = false
    if (this.overshootClamping && this.stiffness !== 0) {
      if (this.startPosition < this.toValue) {
        isOvershooting = position > this.toValue
      } else {
        isOvershooting = position < this.toValue
      }
    }
    const isVelocity = Math.abs(velocity) <= this.restSpeedThreshold
    let isDisplacement = true
    if (this.stiffness !== 0) {
      isDisplacement = Math.abs(this.toValue - position) <= this.restDisplacementThreshold
    }

    if (isOvershooting || (isVelocity && isDisplacement)) {
      if (this.stiffness !== 0) {
        // Settle exactly on the target.
        this.lastPosition = this.toValue
        this.lastVelocity = 0
        this.onUpdate(this.toValue)
      }
      this.__notifyAnimationEnd({ finished: true })
      return
    }

    this.animationFrame = requestFrame(() => this.onFrame())
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
    dlog('spring animation stopped')
    this.__notifyAnimationEnd({ finished: false })
  }
}
