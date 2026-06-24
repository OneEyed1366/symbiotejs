// LayoutAnimation — configures the NEXT commit to animate layout changes. The
// animation itself is performed natively; this module only ships a config to the
// native UIManager via `configureNextLayoutAnimation(config, onSuccess, onError)`
// before the commit. Ports RN's Libraries/LayoutAnimation/LayoutAnimation.js
// (the JS surface + the native configure call), built on symbiote's single
// native trust boundary, `getNativeModule`.
//
// It is a native-bridge consumer (RN's `Platform`/`StyleSheet` purity split puts
// these in the adapter, not in shared — like Keyboard / StatusBar).

import { getNativeModule, dlog } from '@symbiote/shared'

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
} as const

// ---- public type surface (ported from RN's ReactNativeTypes) -------------

const ANIMATION_TYPE = {
  spring: 'spring',
  linear: 'linear',
  easeInEaseOut: 'easeInEaseOut',
  easeIn: 'easeIn',
  easeOut: 'easeOut',
  keyboard: 'keyboard',
} as const

const ANIMATION_PROPERTY = {
  opacity: 'opacity',
  scaleX: 'scaleX',
  scaleY: 'scaleY',
  scaleXY: 'scaleXY',
} as const

export type LayoutAnimationType = (typeof ANIMATION_TYPE)[keyof typeof ANIMATION_TYPE]
export type LayoutAnimationProperty = (typeof ANIMATION_PROPERTY)[keyof typeof ANIMATION_PROPERTY]

export type LayoutAnimationTypes = Readonly<Record<LayoutAnimationType, LayoutAnimationType>>
export type LayoutAnimationProperties = Readonly<
  Record<LayoutAnimationProperty, LayoutAnimationProperty>
>

export interface LayoutAnimationAnim {
  duration?: number
  delay?: number
  springDamping?: number
  initialVelocity?: number
  type?: LayoutAnimationType
  property?: LayoutAnimationProperty
}

export interface LayoutAnimationConfig {
  duration: number
  create?: LayoutAnimationAnim
  update?: LayoutAnimationAnim
  delete?: LayoutAnimationAnim
}

type OnAnimationDidEndCallback = () => void
type OnAnimationDidFailCallback = () => void

// The native UIManager surface this module talks to. The caller vouches for the
// shape via `getNativeModule<T>` (the single trust-boundary narrowing — no
// per-call `as`). The method is optional because an older/partial host may not
// expose it; we feature-detect before calling.
interface NativeLayoutAnimationUIManager {
  configureNextLayoutAnimation?(
    config: LayoutAnimationConfig,
    onSuccess: OnAnimationDidEndCallback,
    onError: OnAnimationDidFailCallback,
  ): void
}

// Lazily resolved, like AppState — importing this module has no native side
// effect; resolution happens on first `configureNext`. `null` once we've looked
// and found nothing linked (headless, or a host without the module).
let uiManager: NativeLayoutAnimationUIManager | null | undefined

function resolveUIManager(): NativeLayoutAnimationUIManager | null {
  if (uiManager !== undefined) return uiManager

  // Try the most plausible bridgeless name first, then fall back. A wrong primary
  // resolves null on a real host (the bridgeless proxy returns null for an
  // unlinked name), so the fallback covers a misnamed primary.
  const candidates = [NATIVE_UI_MANAGER_NAME.primary, NATIVE_UI_MANAGER_NAME.fallback]
  for (const name of candidates) {
    const module = getNativeModule<NativeLayoutAnimationUIManager>(name)
    if (module !== null) {
      // DEVICE-VERIFY-PENDING seam: this line on the simulator/device is the only
      // proof the chosen name is the real one. Keep it permanently (P0 logging gate).
      dlog(`LayoutAnimation: resolved native UIManager via "${name}"`)
      uiManager = module
      return uiManager
    }
  }

  dlog(
    `LayoutAnimation: no native UIManager resolved (tried ${candidates.join(', ')}); ` +
      `configureNext is a no-op (headless or module not linked)`,
  )
  uiManager = null
  return uiManager
}

// ---- config builder ------------------------------------------------------

// Builds a well-formed config for `configureNext`. Mirrors RN's `create`:
// `create`/`delete` carry both type and property; `update` carries only type.
function createLayoutAnimation(
  duration: number,
  type?: LayoutAnimationType,
  property?: LayoutAnimationProperty,
): LayoutAnimationConfig {
  return {
    duration,
    create: { type, property },
    update: { type },
    delete: { type, property },
  }
}

// ---- presets -------------------------------------------------------------

const PRESET_DURATION = {
  easeInEaseOut: 300,
  linear: 500,
  spring: 700,
} as const

const SPRING_DAMPING = 0.4

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
} as const satisfies Readonly<Record<string, LayoutAnimationConfig>>

// ---- configureNext -------------------------------------------------------

// Configures the next commit to be animated. NATIVE drives completion:
// `onAnimationDidEnd` is passed straight through as the native success callback,
// so it fires exactly when the native animation actually finishes — including
// when native extends it past `duration` (spring overshoot, OS slowdown,
// reduce-motion). `onAnimationDidFail` fires only if native config parsing fails.
// When no native module is linked (headless), this is a logged no-op — an app
// without it must still run, so we never throw.
//
// We deliberately do NOT arm a JS `setTimeout(duration + slack)` to force
// completion. RN keeps such a timer as a fallback for platform/renderer combos
// where native never calls back (non-Fabric Android, iOS Fabric pre-ship); but a
// fixed `duration + 17ms` timer races and usually beats the real native callback,
// firing `onAnimationDidEnd` before the animation visually completes. On our
// Fabric-only path native completion is reliably wired, so we rely on it solely.
function configureNext(
  config: LayoutAnimationConfig,
  onAnimationDidEnd?: OnAnimationDidEndCallback,
  onAnimationDidFail?: OnAnimationDidFailCallback,
): void {
  const manager = resolveUIManager()
  if (manager === null || manager.configureNextLayoutAnimation === undefined) {
    dlog('LayoutAnimation.configureNext: no native UIManager; no-op')
    return
  }

  // Idempotent guard so native can't drive both success and error into a
  // double-fire (RN's `animationCompletionHasRun`), without a JS timer racing it.
  let completionHasRun = false
  const onComplete: OnAnimationDidEndCallback = () => {
    if (completionHasRun) return
    completionHasRun = true
    onAnimationDidEnd?.()
  }

  dlog(`LayoutAnimation.configureNext: dispatching config (duration=${config.duration})`)
  // onError only fires if native config parsing fails; default to a no-op.
  manager.configureNextLayoutAnimation(config, onComplete, onAnimationDidFail ?? (() => {}))
}

// ---- the LayoutAnimation facade ------------------------------------------

class LayoutAnimationImpl {
  // Frozen so callers can't mutate the shared type/property tables.
  readonly Types: LayoutAnimationTypes = Object.freeze({ ...ANIMATION_TYPE })
  readonly Properties: LayoutAnimationProperties = Object.freeze({ ...ANIMATION_PROPERTY })
  readonly Presets = Presets

  // Methods (not class fields) so they stay overridable under
  // useDefineForClassFields.
  configureNext(
    config: LayoutAnimationConfig,
    onAnimationDidEnd?: OnAnimationDidEndCallback,
    onAnimationDidFail?: OnAnimationDidFailCallback,
  ): void {
    configureNext(config, onAnimationDidEnd, onAnimationDidFail)
  }

  create(
    duration: number,
    type?: LayoutAnimationType,
    property?: LayoutAnimationProperty,
  ): LayoutAnimationConfig {
    return createLayoutAnimation(duration, type, property)
  }

  easeInEaseOut(onAnimationDidEnd?: OnAnimationDidEndCallback): void {
    configureNext(Presets.easeInEaseOut, onAnimationDidEnd)
  }

  linear(onAnimationDidEnd?: OnAnimationDidEndCallback): void {
    configureNext(Presets.linear, onAnimationDidEnd)
  }

  spring(onAnimationDidEnd?: OnAnimationDidEndCallback): void {
    configureNext(Presets.spring, onAnimationDidEnd)
  }
}

export const LayoutAnimation = new LayoutAnimationImpl()
