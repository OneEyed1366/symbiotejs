// LayoutAnimation: configures the NEXT commit to animate layout changes. The
// animation itself is performed natively; this module only ships a config to the
// native UIManager via `configureNextLayoutAnimation(config, onSuccess, onError)`
// before the commit. Ports RN's Libraries/LayoutAnimation/LayoutAnimation.js
// (the JS surface + the native configure call), built on symbiote's single
// native trust boundary, `getNativeModule`.
//
// It is a native-bridge consumer (RN's `Platform`/`StyleSheet` purity split puts
// these in the adapter, not in shared, like Keyboard / StatusBar).

import { getNativeModule } from '../native-modules';
import { dlog } from '../debug';

// ---- native module routing ----------------------------------------------

// DEVICE-VERIFY-PENDING: on bridgeless Fabric the layout-animation configure call
// is exposed by RN through the UIManager surface (RN's non-Fabric path calls
// `UIManager.configureNextLayoutAnimation`; the Fabric path routes the same args
// onto `global.nativeFabricUIManager.configureNextLayoutAnimation`). Per
// .docs/decisions/0012 and .docs/native-module-platform-routing.md the native
// MODULE NAME is platform-specific and a headless fake answers to ANY name, so
// the name below is the most plausible bridgeless candidate, NOT proven. Only the
// simulator/device resolution log can confirm it; the fallback list is tried in
// order so a wrong primary still resolves on a real host. Verify on-device before
// trusting either name. See the `dlog` at the resolution seam below.
const NATIVE_UI_MANAGER_NAME = {
  primary: 'UIManager',
  fallback: 'FabricUIManager',
} as const;

// ---- public type surface (ported from RN's ReactNativeTypes) -------------

const ANIMATION_TYPE = {
  spring: 'spring',
  linear: 'linear',
  easeInEaseOut: 'easeInEaseOut',
  easeIn: 'easeIn',
  easeOut: 'easeOut',
  keyboard: 'keyboard',
} as const;

const ANIMATION_PROPERTY = {
  opacity: 'opacity',
  scaleX: 'scaleX',
  scaleY: 'scaleY',
  scaleXY: 'scaleXY',
} as const;

export type ILayoutAnimationType = (typeof ANIMATION_TYPE)[keyof typeof ANIMATION_TYPE];
export type ILayoutAnimationProperty = (typeof ANIMATION_PROPERTY)[keyof typeof ANIMATION_PROPERTY];

export type ILayoutAnimationTypes = Readonly<Record<ILayoutAnimationType, ILayoutAnimationType>>;
export type ILayoutAnimationProperties = Readonly<
  Record<ILayoutAnimationProperty, ILayoutAnimationProperty>
>;

export interface ILayoutAnimationAnim {
  duration?: number;
  delay?: number;
  springDamping?: number;
  initialVelocity?: number;
  type?: ILayoutAnimationType;
  property?: ILayoutAnimationProperty;
}

export interface ILayoutAnimationConfig {
  duration: number;
  create?: ILayoutAnimationAnim;
  update?: ILayoutAnimationAnim;
  delete?: ILayoutAnimationAnim;
}

type IOnAnimationDidEndCallback = () => void;
type IOnAnimationDidFailCallback = () => void;

// The native UIManager surface this module talks to. The caller vouches for the
// shape via `getNativeModule<T>` (the single trust-boundary narrowing, no
// per-call `as`). The method is optional because an older/partial host may not
// expose it; we feature-detect before calling.
interface INativeLayoutAnimationUIManager {
  configureNextLayoutAnimation?(
    config: ILayoutAnimationConfig,
    onSuccess: IOnAnimationDidEndCallback,
    onError: IOnAnimationDidFailCallback,
  ): void;
}

// Resolved FRESH on every configureNext, deliberately NOT memoized. The native module can
// be absent at one moment and linked later, and a cached answer would pin the first result;
// getNativeModule is a cheap proxy lookup, so per-call resolution costs nothing and stays
// correct. (Memoizing here also broke the headless smoke, which flips a fake module on/off
// in one process: a cached module survived the flip-off, so configureNext kept calling native
// when the module was meant to be absent.)
function resolveUIManager(): INativeLayoutAnimationUIManager | null {
  // Try the most plausible bridgeless name first, then fall back. A wrong primary
  // resolves null on a real host (the bridgeless proxy returns null for an
  // unlinked name), so the fallback covers a misnamed primary.
  const candidates = [NATIVE_UI_MANAGER_NAME.primary, NATIVE_UI_MANAGER_NAME.fallback];
  for (const name of candidates) {
    const module = getNativeModule<INativeLayoutAnimationUIManager>(name);
    if (module !== null) {
      // DEVICE-VERIFY-PENDING seam: this line on the simulator/device is the only
      // proof the chosen name is the real one. Keep it permanently (P0 logging gate).
      dlog(`LayoutAnimation: resolved native UIManager via "${name}"`);
      return module;
    }
  }

  dlog(
    `LayoutAnimation: no native UIManager resolved (tried ${candidates.join(', ')}); ` +
      `configureNext is a no-op (headless or module not linked)`,
  );
  return null;
}

// ---- config builder ------------------------------------------------------

// Builds a well-formed config for `configureNext`. Mirrors RN's `create`:
// `create`/`delete` carry both type and property; `update` carries only type.
function createLayoutAnimation(
  duration: number,
  type?: ILayoutAnimationType,
  property?: ILayoutAnimationProperty,
): ILayoutAnimationConfig {
  return {
    duration,
    create: { type, property },
    update: { type },
    delete: { type, property },
  };
}

// ---- presets -------------------------------------------------------------

const PRESET_DURATION = {
  easeInEaseOut: 300,
  linear: 500,
  spring: 700,
} as const;

const SPRING_DAMPING = 0.4;

const Presets = {
  easeInEaseOut: createLayoutAnimation(
    PRESET_DURATION.easeInEaseOut,
    ANIMATION_TYPE.easeInEaseOut,
    ANIMATION_PROPERTY.opacity,
  ),
  linear: createLayoutAnimation(
    PRESET_DURATION.linear,
    ANIMATION_TYPE.linear,
    ANIMATION_PROPERTY.opacity,
  ),
  spring: {
    duration: PRESET_DURATION.spring,
    create: { type: ANIMATION_TYPE.linear, property: ANIMATION_PROPERTY.opacity },
    update: { type: ANIMATION_TYPE.spring, springDamping: SPRING_DAMPING },
    delete: { type: ANIMATION_TYPE.linear, property: ANIMATION_PROPERTY.opacity },
  },
} as const satisfies Readonly<Record<string, ILayoutAnimationConfig>>;

// ---- enabled gate --------------------------------------------------------

// Whether `configureNext` actually arms the next commit. RN seeds this from a
// feature flag (LayoutAnimation.js:45) and exposes `setEnabled` to toggle it;
// here it defaults on (our Fabric path always supports it) and `configureNext`
// short-circuits when it is off, mirroring RN's `if (!isLayoutAnimationEnabled)
// return` (LayoutAnimation.js:69).
let isLayoutAnimationEnabled = true;

// Gates whether the next commit animates. RN's own `setLayoutAnimationEnabled`
// (LayoutAnimation.js:48) is a no-op due to a self-assignment bug; we implement
// the intended behaviour: a disabled state makes `configureNext` a no-op.
function setLayoutAnimationEnabled(value: boolean): void {
  isLayoutAnimationEnabled = value;
}

// ---- configureNext -------------------------------------------------------

// Configures the next commit to be animated. NATIVE drives completion:
// `onAnimationDidEnd` is passed straight through as the native success callback,
// so it fires exactly when the native animation actually finishes, including
// when native extends it past `duration` (spring overshoot, OS slowdown,
// reduce-motion). `onAnimationDidFail` fires only if native config parsing fails.
// When no native module is linked (headless), this is a logged no-op; an app
// without it must still run, so we never throw.
//
// We deliberately do NOT arm a JS `setTimeout(duration + slack)` to force
// completion. RN keeps such a timer as a fallback for platform/renderer combos
// where native never calls back (non-Fabric Android, iOS Fabric pre-ship); but a
// fixed `duration + 17ms` timer races and usually beats the real native callback,
// firing `onAnimationDidEnd` before the animation visually completes. On our
// Fabric-only path native completion is reliably wired, so we rely on it solely.
function configureNext(
  config: ILayoutAnimationConfig,
  onAnimationDidEnd?: IOnAnimationDidEndCallback,
  onAnimationDidFail?: IOnAnimationDidFailCallback,
): void {
  // RN bails before touching native when animations are disabled
  // (LayoutAnimation.js:69).
  if (!isLayoutAnimationEnabled) {
    dlog('LayoutAnimation.configureNext: disabled; no-op');
    return;
  }

  const manager = resolveUIManager();
  if (manager === null || manager.configureNextLayoutAnimation === undefined) {
    dlog('LayoutAnimation.configureNext: no native UIManager; no-op');
    return;
  }

  // Idempotent guard so native can't drive both success and error into a
  // double-fire (RN's `animationCompletionHasRun`), without a JS timer racing it.
  let completionHasRun = false;
  const onComplete: IOnAnimationDidEndCallback = () => {
    if (completionHasRun) return;
    completionHasRun = true;
    onAnimationDidEnd?.();
  };

  dlog(`LayoutAnimation.configureNext: dispatching config (duration=${config.duration})`);
  // onError only fires if native config parsing fails; default to a no-op.
  manager.configureNextLayoutAnimation(config, onComplete, onAnimationDidFail ?? (() => {}));
}

// ---- the LayoutAnimation facade ------------------------------------------

class LayoutAnimationImpl {
  // Frozen so callers can't mutate the shared type/property tables.
  readonly Types: ILayoutAnimationTypes = Object.freeze({ ...ANIMATION_TYPE });
  readonly Properties: ILayoutAnimationProperties = Object.freeze({ ...ANIMATION_PROPERTY });
  readonly Presets = Presets;

  // Methods (not class fields) so they stay overridable under
  // useDefineForClassFields.
  configureNext(
    config: ILayoutAnimationConfig,
    onAnimationDidEnd?: IOnAnimationDidEndCallback,
    onAnimationDidFail?: IOnAnimationDidFailCallback,
  ): void {
    configureNext(config, onAnimationDidEnd, onAnimationDidFail);
  }

  create(
    duration: number,
    type?: ILayoutAnimationType,
    property?: ILayoutAnimationProperty,
  ): ILayoutAnimationConfig {
    return createLayoutAnimation(duration, type, property);
  }

  easeInEaseOut(onAnimationDidEnd?: IOnAnimationDidEndCallback): void {
    configureNext(Presets.easeInEaseOut, onAnimationDidEnd);
  }

  linear(onAnimationDidEnd?: IOnAnimationDidEndCallback): void {
    configureNext(Presets.linear, onAnimationDidEnd);
  }

  spring(onAnimationDidEnd?: IOnAnimationDidEndCallback): void {
    configureNext(Presets.spring, onAnimationDidEnd);
  }

  // RN exposes this as both `setLayoutAnimationEnabled` and the `setEnabled`
  // alias (LayoutAnimation.js:48,222); we surface the primary name. A disabled
  // state makes `configureNext` a no-op.
  setLayoutAnimationEnabled(enabled: boolean): void {
    setLayoutAnimationEnabled(enabled);
  }

  // RN's dev-time config validator. It has been retired upstream
  // (LayoutAnimation.js:204); the live impl only logs that it is disabled, so
  // we mirror that and keep the call a no-op rather than re-add dead validation.
  checkConfig(..._args: unknown[]): void {
    dlog('LayoutAnimation.checkConfig(...) has been disabled.');
  }
}

export const LayoutAnimation = new LayoutAnimationImpl();
