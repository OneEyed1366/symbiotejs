// AnimatedValueXY — a 2D value for pan-gesture-style animations. It is not a
// driving node itself: it multiplexes two ordinary AnimatedValues (x, y), so the
// same clone-on-write and listener machinery that powers AnimatedValue applies
// per-axis. Ported from RN's AnimatedValueXY.js with the native-driver and
// platform-config branches removed (ADR 0016) — the two child values carry their
// own native state if they are ever made native.

import { AnimatedValue } from './value'

export interface ValueXY {
  x: number
  y: number
}

type ValueXYListener = (value: ValueXY) => void

let nextListenerId = 1

function isAnimatedValuePair(value: {
  x: number | AnimatedValue
  y: number | AnimatedValue
}): value is { x: AnimatedValue; y: AnimatedValue } {
  return value.x instanceof AnimatedValue && value.y instanceof AnimatedValue
}

// Not an AnimatedNode: you bind the inner x/y (via getLayout / getTranslateTransform),
// never the XY object itself, so it carries no graph-node base — just the two values.
export class AnimatedValueXY {
  readonly x: AnimatedValue
  readonly y: AnimatedValue
  // Each joint id maps to the two per-axis listener ids it registered, so
  // removeListener can tear both down together.
  private readonly jointListeners = new Map<string, { x: string; y: string }>()

  constructor(value: { x: number | AnimatedValue; y: number | AnimatedValue } = { x: 0, y: 0 }) {
    if (typeof value.x === 'number' && typeof value.y === 'number') {
      this.x = new AnimatedValue(value.x)
      this.y = new AnimatedValue(value.y)
    } else if (isAnimatedValuePair(value)) {
      this.x = value.x
      this.y = value.y
    } else {
      throw new Error(
        'AnimatedValueXY must be initialized with an object of numbers or AnimatedValues.',
      )
    }
  }

  __getValue(): ValueXY {
    return { x: this.x.__getValue(), y: this.y.__getValue() }
  }

  // Directly set both axes. Stops any running per-axis animation and updates
  // every bound prop.
  setValue(value: ValueXY): void {
    this.x.setValue(value.x)
    this.y.setValue(value.y)
  }

  // An offset applied on top of whatever value is set, per axis.
  setOffset(offset: ValueXY): void {
    this.x.setOffset(offset.x)
    this.y.setOffset(offset.y)
  }

  // Fold each axis's offset into its base value; the output is unchanged.
  flattenOffset(): void {
    this.x.flattenOffset()
    this.y.flattenOffset()
  }

  // Move each axis's base value into its offset; the output is unchanged.
  extractOffset(): void {
    this.x.extractOffset()
    this.y.extractOffset()
  }

  // Stop any running animation on either axis. `callback` receives the final
  // 2D value, useful for syncing state to the resting position.
  stopAnimation(callback?: (value: ValueXY) => void): void {
    this.x.stopAnimation()
    this.y.stopAnimation()
    callback?.(this.__getValue())
  }

  // Stop any animation and reset both axes to their original values.
  resetAnimation(callback?: (value: ValueXY) => void): void {
    this.x.resetAnimation()
    this.y.resetAnimation()
    callback?.(this.__getValue())
  }

  // Observe updates from either axis as a single {x, y} event. Both axes share
  // one joint callback, so a change on either fires the listener with the
  // current 2D value.
  addListener(callback: ValueXYListener): string {
    const id = String(nextListenerId++)
    const jointCallback = (): void => {
      callback(this.__getValue())
    }
    this.jointListeners.set(id, {
      x: this.x.addListener(jointCallback),
      y: this.y.addListener(jointCallback),
    })
    return id
  }

  removeListener(id: string): void {
    const pair = this.jointListeners.get(id)
    if (pair === undefined) {
      return
    }
    this.x.removeListener(pair.x)
    this.y.removeListener(pair.y)
    this.jointListeners.delete(id)
  }

  removeAllListeners(): void {
    this.x.removeAllListeners()
    this.y.removeAllListeners()
    this.jointListeners.clear()
  }

  // Convert {x, y} into {left, top} for direct use in a style object.
  getLayout(): { left: AnimatedValue; top: AnimatedValue } {
    return { left: this.x, top: this.y }
  }

  // Convert {x, y} into a usable translation transform array.
  getTranslateTransform(): [{ translateX: AnimatedValue }, { translateY: AnimatedValue }] {
    return [{ translateX: this.x }, { translateY: this.y }]
  }
}
