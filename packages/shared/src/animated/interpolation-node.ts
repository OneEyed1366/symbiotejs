// AnimatedInterpolation — a graph node that maps its parent's numeric value
// through an interpolation. Ported from RN's AnimatedInterpolation.js, numeric
// path only (string/color deferred, ADR 0016), native config removed.

import { AnimatedNode, AnimatedWithChildren } from './graph'
import {
  checkValidRanges,
  createNumericInterpolation,
  type InterpolationConfig,
} from './interpolation'
import type { NativeNodeConfig } from './native/native-animated'

export class AnimatedInterpolation extends AnimatedWithChildren {
  private readonly parent: AnimatedNode
  private readonly config: InterpolationConfig
  private interpolation: ((input: number) => number) | undefined

  constructor(parent: AnimatedNode, config: InterpolationConfig) {
    super()
    this.parent = parent
    this.config = config
    // Validate eagerly so a bad range fails at construction, not first frame.
    checkValidRanges(config.inputRange, config.outputRange)
  }

  private getInterpolation(): (input: number) => number {
    if (this.interpolation === undefined) {
      this.interpolation = createNumericInterpolation(this.config)
    }
    return this.interpolation
  }

  override __getValue(): number {
    const parentValue = this.parent.__getValue()
    if (typeof parentValue !== 'number') {
      throw new Error('Cannot interpolate an input which is not a number')
    }
    return this.getInterpolation()(parentValue)
  }

  interpolate(config: InterpolationConfig): AnimatedInterpolation {
    return new AnimatedInterpolation(this, config)
  }

  override __attach(): void {
    this.parent.__addChild(this)
    super.__attach()
  }

  override __detach(): void {
    this.parent.__removeChild(this)
    super.__detach()
  }

  // Make the upstream value native first, so the parent->interpolation edge can be
  // wired when this node is reached from a leaf rather than from the value.
  override __makeNative(): void {
    this.parent.__makeNative()
    super.__makeNative()
  }

  override __getNativeConfig(): NativeNodeConfig {
    return {
      type: 'interpolation',
      inputRange: this.config.inputRange,
      outputRange: this.config.outputRange,
      extrapolateLeft: this.config.extrapolateLeft ?? this.config.extrapolate ?? 'extend',
      extrapolateRight: this.config.extrapolateRight ?? this.config.extrapolate ?? 'extend',
    }
  }
}
