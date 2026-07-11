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
import { isRecord } from '../type-guards';

// ---- native module routing ----------------------------------------------

// RN's actual dual-path (LayoutAnimation.js): the Fabric global slot
// (`global.nativeFabricUIManager`, a JSI slot read directly, not a TurboModule
// lookup) is tried FIRST; only when it lacks `configureNextLayoutAnimation` does
// RN fall back to the TurboModule `UIManager.configureNextLayoutAnimation`
// (`TurboModuleRegistry.getEnforcing('UIManager')` in NativeUIManager.js; iOS's
// RCTUIManager.mm registers under the same bare "UIManager" name via
// RCT_EXPORT_MODULE()). There is only ONE correct TurboModule name; RN never
// registers a module under "FabricUIManager".
const NATIVE_UI_MANAGER_MODULE_NAME = 'UIManager';

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

// The caller vouches for this shape via `getNativeModule<T>` (the single
// trust-boundary narrowing, no per-call `as`). The method is optional because an
// older/partial host may not expose it; we feature-detect before calling.
interface INativeLayoutAnimationUIManager {
  configureNextLayoutAnimation?(
    config: ILayoutAnimationConfig,
    onSuccess: IOnAnimationDidEndCallback,
    onError: IOnAnimationDidFailCallback,
  ): void;
}

// Narrows the Fabric global slot down to whether it ALSO carries the
// layout-animation hook. `fabric.ts`'s `IFabricSlot` deliberately omits this
// method (out of scope for the engine's own mutation API), so the slot's static
// type never has it either; this is the runtime feature-detect RN itself does
// (`FabricUIManager?.configureNextLayoutAnimation` in LayoutAnimation.js) before
// calling it, no `as` cast needed.
function hasConfigureNextLayoutAnimation(value: unknown): value is INativeLayoutAnimationUIManager {
  return isRecord(value) && typeof value.configureNextLayoutAnimation === 'function';
}

// Resolved FRESH on every configureNext, deliberately NOT memoized. Either mechanism can
// come and go at runtime (the Fabric global installs during bootstrap; a TurboModule can be
// absent at one moment and linked later), and a cached answer would pin the first result;
// both lookups are cheap, so per-call resolution costs nothing and stays correct.
// (Memoizing here also broke the headless smoke, which flips a fake module on/off in one
// process: a cached module survived the flip-off, so configureNext kept calling native when
// the module was meant to be absent.)
function resolveUIManager(): INativeLayoutAnimationUIManager | null {
  // Mechanism 1: the Fabric global slot, read directly: a JSI global, not a
  // TurboModule lookup.
  const fabricUIManager = globalThis.nativeFabricUIManager;
  if (hasConfigureNextLayoutAnimation(fabricUIManager)) {
    dlog('LayoutAnimation: resolved native UIManager via the Fabric global slot');
    return fabricUIManager;
  }

  // Mechanism 2: the TurboModule fallback (RN's non-Fabric path).
  const module = getNativeModule<INativeLayoutAnimationUIManager>(NATIVE_UI_MANAGER_MODULE_NAME);
  if (module !== null) {
    dlog(`LayoutAnimation: resolved native UIManager via "${NATIVE_UI_MANAGER_MODULE_NAME}"`);
    return module;
  }

  dlog(
    'LayoutAnimation: no native UIManager resolved (no Fabric global slot, ' +
      `"${NATIVE_UI_MANAGER_MODULE_NAME}" module not linked); configureNext is a no-op ` +
      '(headless or module not linked)',
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
// so it fires exactly when the native animation finishes, including
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
  // Default to a no-op when the caller doesn't supply one.
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

  // Coerce an arbitrary string (e.g. a keyboard event's `easing` field) onto a known
  // ILayoutAnimationType, falling back to 'keyboard' when it isn't a key of `Types`.
  // Owned here, not by a caller: `Types` is this class's own frozen table, so by
  // Information Expert the coercion belongs on the type it reads (Keyboard's
  // scheduleLayoutAnimation is the first caller; RN's own
  // `LayoutAnimation.Types[easing] || 'keyboard'` is the same rule).
  coerceType(easing: string): ILayoutAnimationType {
    const types: Readonly<Record<string, ILayoutAnimationType>> = this.Types;
    return types[easing] ?? ANIMATION_TYPE.keyboard;
  }
}

export const LayoutAnimation = new LayoutAnimationImpl();
