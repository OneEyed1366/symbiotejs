// Shared, platform-neutral Platform bits: the public select/OS types, the static
// PlatformStatic shape, and the native PlatformConstants resolution machinery — the
// one place both platform.ios.ts and platform.android.ts pull from. Each platform file
// owns only what genuinely differs: the OS literal, the constants shape + guard, the
// select precedence, and the device-class getters. The filename is the selector (Metro
// picks platform.ios / platform.android by host); no Platform.OS read lives here.
// See .docs/decisions/0022 (and 0020 for the same split on component names).

import { dlog } from './debug'
import { getNativeModule } from './native-modules'

// The native module name RN registers PlatformConstants under — identical on both
// platforms; only getConstants()'s SHAPE differs, which each platform file guards.
export const PLATFORM_CONSTANTS = 'PlatformConstants'

// Native unresolvable (headless, or a binary without it): RN's getters would throw,
// but a Platform read must never crash a render, so getters fall back to neutral
// defaults. '' mirrors iOS "unknown OS version"; Android uses 0 for an unknown API level.
export const UNKNOWN_VERSION = ''

export type PlatformOSType = 'ios' | 'android' | 'macos' | 'windows' | 'web' | 'native'

// RN's Platform.select spec: any subset of OS keys, optionally with `default`. Each
// platform resolver consults only its own key, then `native`, then `default`.
export type PlatformSelectSpec<T> = {
  ios?: T
  android?: T
  macos?: T
  windows?: T
  web?: T
  native?: T
  default?: T
}

// The static Platform surface, generic over the host's constants shape (iOS and
// Android getConstants() return different payloads). Version is a string on iOS and a
// numeric API level on Android — hence string | number, with each concrete object
// pinning the precise type. isPad/isMacCatalyst stay on the shared shape so app code
// branches uniformly; off iOS they are simply always false (RN: iOS-only concepts).
export interface PlatformStatic<TConstants> {
  readonly OS: PlatformOSType
  readonly Version: string | number
  readonly constants: TConstants | undefined
  readonly isPad: boolean
  readonly isTV: boolean
  readonly isVision: boolean
  readonly isTesting: boolean
  readonly isDisableAnimations: boolean
  readonly isMacCatalyst: boolean
  select<T>(spec: PlatformSelectSpec<T>): T | undefined
}

// Build a cached getConstants() resolver behind a structural guard. The native payload
// crosses from an untyped HostObject into TConstants only if `guard` vouches for it (no
// per-call cast); a failing shape is treated as "module absent". Resolved on first
// access and cached (RN caches in __constants), re-attempted until valid so a
// later-installed module is still picked up.
export function createConstantsResolver<TConstants>(
  guard: (value: unknown) => value is TConstants,
): () => TConstants | undefined {
  let cached: TConstants | undefined
  return () => {
    if (cached !== undefined) return cached

    const module = getNativeModule<{ getConstants(): TConstants }>(PLATFORM_CONSTANTS)
    if (module === null) {
      dlog('Platform: PlatformConstants not resolvable via native bridge — using defaults')
      return undefined
    }

    const constants: unknown = module.getConstants()
    if (!guard(constants)) {
      dlog('Platform: PlatformConstants.getConstants() returned an unexpected shape — using defaults')
      return undefined
    }

    dlog('Platform: resolved PlatformConstants')
    cached = constants
    return cached
  }
}
