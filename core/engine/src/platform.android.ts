// The Android Platform — a faithful port of RN's Libraries/Utilities/Platform.android.js.
// `OS` is the static 'android'; `Version` is the numeric API level and the rest come
// from the PlatformConstants native module (RN spec NativePlatformConstantsAndroid.js —
// a different payload from iOS). Metro picks this on an Android host. The module name is
// the same 'PlatformConstants'; only the shape differs. See .docs/decisions/0022.

import {
  createConstantsResolver,
  type PlatformSelectSpec,
  type PlatformStatic,
} from './platform-shared'

export type { PlatformOSType, PlatformSelectSpec, PlatformStatic } from './platform-shared'

// The filename already selected this host — 'android' is a literal, not a probe.
const OS_ANDROID = 'android'

// RN reads isTV off the uiMode constant.
const UI_MODE_TV = 'tv'

// Native unresolvable (headless): RN's Version getter would throw; we return 0, the
// neutral "unknown API level", so a Platform read never crashes a render.
const UNKNOWN_API_LEVEL = 0

// The shape of PlatformConstants.getConstants() on Android (mirrors the RN spec). The
// device-info fields (Brand/Model/etc.) are carried verbatim from native.
export interface PlatformConstantsAndroid {
  isTesting: boolean
  isDisableAnimations?: boolean
  reactNativeVersion: {
    major: number
    minor: number
    patch: number
    prerelease?: number | string | null
  }
  Version: number
  Release: string
  Serial: string
  Fingerprint: string
  Model: string
  ServerHost?: string
  uiMode: string
  Brand: string
  Manufacturer: string
}

function isPlatformConstantsAndroid(value: unknown): value is PlatformConstantsAndroid {
  if (typeof value !== 'object' || value === null) return false
  return 'Version' in value && 'uiMode' in value
}

const resolveConstants = createConstantsResolver(isPlatformConstantsAndroid)

export const Platform: PlatformStatic<PlatformConstantsAndroid> = {
  OS: OS_ANDROID,

  get Version(): number {
    return resolveConstants()?.Version ?? UNKNOWN_API_LEVEL
  },

  get constants(): PlatformConstantsAndroid | undefined {
    return resolveConstants()
  },

  // RN Android's Platform has no isPad / isMacCatalyst; they're always false here so app
  // code can read them uniformly across hosts (RN parity: those are iOS-only concepts).
  get isPad(): boolean {
    return false
  },

  get isTV(): boolean {
    return resolveConstants()?.uiMode === UI_MODE_TV
  },

  // RN Android's Platform.isVision is a hard false.
  get isVision(): boolean {
    return false
  },

  // RN gates this behind __DEV__; shared has no __DEV__ flag, so we read the native
  // flag directly — a release build's native module reports false anyway.
  get isTesting(): boolean {
    return resolveConstants()?.isTesting ?? false
  },

  get isDisableAnimations(): boolean {
    const constants = resolveConstants()
    return constants?.isDisableAnimations ?? constants?.isTesting ?? false
  },

  get isMacCatalyst(): boolean {
    return false
  },

  // RN's exact Android precedence: android -> native -> default.
  select<T>(spec: PlatformSelectSpec<T>): T | undefined {
    if ('android' in spec) return spec.android
    if ('native' in spec) return spec.native
    return spec.default
  },
}
