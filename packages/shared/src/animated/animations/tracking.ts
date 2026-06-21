// AnimatedTracking — drives a value toward a MOVING target. When you write
// `Animated.spring(value, { toValue: anotherValue })`, the target is itself an
// AnimatedNode; this node subscribes to it as a leaf child and, each time the
// target changes, re-launches the animation toward the target's new value — so the
// value chases the target continuously (a spring following a gesture). Ported from
// RN's AnimatedTracking.js, JS path; native tracking re-uses the per-launch driver.

import type { Animation, EndCallback } from '../animation'
import { AnimatedNode } from '../graph'
import type { AnimatedValue } from '../value'

export class AnimatedTracking extends AnimatedNode {
  constructor(
    private readonly value: AnimatedValue,
    private readonly parent: AnimatedNode,
    // Builds a fresh driver aimed at a concrete target value — the config captured
    // at call time with `toValue` resolved to the parent's current number.
    private readonly createAnimation: (toValue: number) => Animation,
    private readonly endCallback?: EndCallback,
  ) {
    super()
    // Subscribe to the target immediately (RN does this in the constructor), so a
    // target change reaches update() even before the first launch.
    this.__attach()
  }

  override __getValue(): number {
    const target = this.parent.__getValue()
    return typeof target === 'number' ? target : 0
  }

  override __attach(): void {
    this.parent.__addChild(this)
  }

  override __detach(): void {
    this.parent.__removeChild(this)
    super.__detach()
  }

  // Leaf seam (a method, never a class field — flushValue detects leaves
  // structurally and a field would shadow it under useDefineForClassFields). The
  // target moved: launch a fresh animation toward its new value.
  update(): void {
    this.value.animate(this.createAnimation(this.__getValue()), this.endCallback)
  }
}
