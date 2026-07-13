// AnimatedValue: the standard driving value. One value can drive many props in
// sync but is driven by one mechanism at a time: a new mechanism (a fresh
// animation, or setValue) stops the previous one. Ported from RN's
// AnimatedValue.js with the native-driver branches removed; tracking
// (animating toward another animated node) is deferred.

import type { IAnimation, IEndCallback } from './animation';
import { AnimatedWithChildren, flushValue, type IValueListener } from './graph';
import type { AnimatedTracking } from './animations/tracking';
import {
  nativeAnimated,
  type INativeAnimationConfig,
  type INativeNodeConfig,
  type IPlatformConfig,
} from './native/native-animated';

export class AnimatedValue extends AnimatedWithChildren {
  private value: number;
  private readonly startingValue: number;
  private offset: number;
  private animation: IAnimation | null;
  // True while we are streaming native value updates back to JS listeners (only
  // meaningful when the value is native-driven and has at least one JS listener).
  private nativeListening = false;
  // Set while this value is chasing a moving target (Animated.spring toValue: node).
  private tracking: AnimatedTracking | null = null;

  constructor(value: number) {
    super();
    if (typeof value !== 'number') {
      throw new Error('AnimatedValue: Attempting to set value to undefined');
    }
    this.startingValue = value;
    this.value = value;
    this.offset = 0;
    this.animation = null;
  }

  override __detach(): void {
    this.stopAnimation();
    this.stopListeningToNativeValueUpdates();
    super.__detach();
  }

  // A JS listener on a native-driven value sees nothing per frame unless native
  // streams updates back, so adding the first listener starts that stream and
  // removing the last stops it. When the value isn't native, these are no-ops and
  // the base listener machinery alone fires (JS owns the frames).
  override addListener(callback: IValueListener): string {
    const id = super.addListener(callback);
    if (this.isNative) this.startListeningToNativeValueUpdates();
    return id;
  }

  override removeListener(id: string): void {
    super.removeListener(id);
    if (!this.hasListeners()) this.stopListeningToNativeValueUpdates();
  }

  override removeAllListeners(): void {
    super.removeAllListeners();
    this.stopListeningToNativeValueUpdates();
  }

  // A value made native while listeners already exist must start streaming now.
  override __makeNative(platformConfig?: IPlatformConfig): void {
    super.__makeNative(platformConfig);
    if (this.hasListeners()) this.startListeningToNativeValueUpdates();
  }

  private startListeningToNativeValueUpdates(): void {
    if (this.nativeListening || !this.isNative) return;
    this.nativeListening = true;
    nativeAnimated.startListeningToValue(this.__getNativeTag(), value => {
      // __onNativeUpdate syncs the JS value and fires our listeners (no flush:
      // native already moved the view).
      this.__onNativeUpdate(value);
    });
  }

  private stopListeningToNativeValueUpdates(): void {
    if (!this.nativeListening) return;
    this.nativeListening = false;
    nativeAnimated.stopListeningToValue(this.__getNativeTag());
  }

  override __getValue(): number {
    return this.value + this.offset;
  }

  // Directly set the value. Stops any running animation and updates every bound
  // prop. When the value is native-driven we skip the JS flush (native owns the
  // view) and push the value into the native node instead.
  setValue(value: number): void {
    if (this.animation) {
      this.animation.stop();
      this.animation = null;
    }
    this.updateValue(value, !this.isNative);
    if (this.isNative) {
      nativeAnimated.setAnimatedNodeValue(this.__getNativeTag(), value);
    }
  }

  // An offset applied on top of whatever value is set (via setValue, an
  // animation, or Animated.event). Useful for compensating a gesture's start.
  setOffset(offset: number): void {
    this.offset = offset;
    if (this.isNative) {
      nativeAnimated.setAnimatedNodeOffset(this.__getNativeTag(), offset);
    }
  }

  // Fold the offset into the base value; the output is unchanged.
  flattenOffset(): void {
    this.value += this.offset;
    this.offset = 0;
    if (this.isNative) {
      nativeAnimated.flattenAnimatedNodeOffset(this.__getNativeTag());
    }
  }

  // Move the base value into the offset; the output is unchanged.
  extractOffset(): void {
    this.offset += this.value;
    this.value = 0;
    if (this.isNative) {
      nativeAnimated.extractAnimatedNodeOffset(this.__getNativeTag());
    }
  }

  // Sync the JS value from a native update (the driver's completion callback, or a
  // native value listener) without re-flushing. Native already moved the view.
  __onNativeUpdate(value: number, offset?: number): void {
    this.updateValue(value, false);
    if (offset !== undefined) {
      this.offset = offset;
    }
  }

  // Own the native-driver "start" handshake end-to-end: make this value native, mint
  // its tag, hand the curve to the native module, and on completion sync the JS value
  // (no re-flush to bound leaves' native side; native already moved the view). A
  // driver (BaseAnimation.startNativeIfNeeded) supplies only what IT owns: the curve
  // config, its own animation id, its platform bag, and its own end callback, never
  // touching __makeNative / __getNativeTag / __onNativeUpdate / flushValue directly.
  // Information Expert: this value is the one object that actually holds those internals.
  __startNativeAnimation(
    config: INativeAnimationConfig,
    nativeId: number,
    onEnd: (finished: boolean) => void,
    platformConfig?: IPlatformConfig,
  ): void {
    this.__makeNative(platformConfig);
    nativeAnimated.startAnimatingNode(nativeId, this.__getNativeTag(), config, result => {
      onEnd(result.finished);
      if (result.value !== undefined) {
        this.__onNativeUpdate(result.value, result.offset);
        flushValue(this);
      }
    });
  }

  override __getNativeConfig(): INativeNodeConfig {
    return { type: 'value', value: this.value, offset: this.offset };
  }

  // Stop any running animation OR tracking. `callback` receives the final value,
  // useful for syncing state to the animation's resting position.
  stopAnimation(callback?: (value: number) => void): void {
    this.stopTracking();
    if (this.animation) {
      this.animation.stop();
    }
    this.animation = null;
    callback?.(this.__getValue());
  }

  // Chase a moving target: the AnimatedTracking subscribes to the target node and
  // re-launches the animation on every target change. Like RN, animate() itself does
  // NOT clear tracking (the tracking node calls animate on each update); only
  // stopAnimation / a new track tears the previous tracking down.
  track(tracking: AnimatedTracking): void {
    this.stopTracking();
    this.tracking = tracking;
    tracking.update();
  }

  private stopTracking(): void {
    if (this.tracking !== null) {
      this.tracking.__detach();
      this.tracking = null;
    }
  }

  // Stop any animation and reset to the original value.
  resetAnimation(callback?: (value: number) => void): void {
    this.stopAnimation(callback);
    this.value = this.startingValue;
  }

  // Drive this value with an animation. Typically called by Animated.timing /
  // spring / decay rather than directly.
  animate(animation: IAnimation, callback?: IEndCallback): void {
    const previousAnimation = this.animation;
    if (this.animation) {
      this.animation.stop();
    }
    this.animation = animation;
    animation.start(
      this.value,
      value => {
        this.updateValue(value, true);
      },
      result => {
        this.animation = null;
        callback?.(result);
      },
      previousAnimation,
      this,
    );
  }

  private updateValue(value: number, flush: boolean): void {
    if (value === undefined) {
      throw new Error('AnimatedValue: Attempting to set value to undefined');
    }
    this.value = value;
    if (flush) {
      flushValue(this);
    }
    this.__callListeners(this.__getValue());
  }
}
