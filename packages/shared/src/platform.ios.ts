// The iOS Platform — a faithful port of RN's Libraries/Utilities/Platform.ios.js. `OS`
// is the static 'ios'; everything else derives from the PlatformConstants native module
// (RN spec NativePlatformConstantsIOS.js), read lazily and cached via the shared
// resolver. Metro picks this on an iOS host; it is also the base re-export target
// (platform.ts) so tsc / tsx / web (no Metro) land here too. See .docs/decisions/0022.

import {
  createConstantsResolver,
  UNKNOWN_VERSION,
  type PlatformSelectSpec,
  type PlatformStatic,
} from './platform-shared'

export type { PlatformOSType, PlatformSelectSpec, PlatformStatic } from './platform-shared'

// interfaceIdiom values RN compares against for the device-class getters.
const IDIOM_PAD = 'pad'
const IDIOM_TV = 'tv'
const IDIOM_VISION = 'vision'

// 'ios' is a literal, not a runtime probe: the filename already selected this host.
const OS_IOS = 'ios'

// The shape of PlatformConstants.getConstants() on iOS (mirrors the RN spec). Fields
// optional-on-native stay optional so the runtime guard below is the only voucher.
export interface PlatformConstantsIOS {
  forceTouchAvailable: boolean
  interfaceIdiom: string
  isTesting: boolean
  isDisableAnimations?: boolean
  osVersion: string
  systemName: string
  reactNativeVersion: {
    major: number
    minor: number
    patch: number
    prerelease?: number | string | null
  }
  isMacCatalyst?: boolean
}

function isPlatformConstantsIOS(value: unknown): value is PlatformConstantsIOS {
  if (typeof value !== 'object' || value === null) return false
  return 'osVersion' in value && 'interfaceIdiom' in value
}

const resolveConstants = createConstantsResolver(isPlatformConstantsIOS)

function idiomEquals(idiom: string): boolean {
  return resolveConstants()?.interfaceIdiom === idiom
}

export const Platform: PlatformStatic<PlatformConstantsIOS> = {
  OS: OS_IOS,

  get Version(): string {
    return resolveConstants()?.osVersion ?? UNKNOWN_VERSION
  },

  // The whole getConstants() payload (RN exposes it as Platform.constants). May be
  // undefined headless — RN would have thrown; we return undefined so callers branch.
  get constants(): PlatformConstantsIOS | undefined {
    return resolveConstants()
  },

  get isPad(): boolean {
    return idiomEquals(IDIOM_PAD)
  },

  get isTV(): boolean {
    return idiomEquals(IDIOM_TV)
  },

  get isVision(): boolean {
    return idiomEquals(IDIOM_VISION)
  },

  get isTesting(): boolean {
    return resolveConstants()?.isTesting ?? false
  },

  // RN: isDisableAnimations ?? isTesting. The native flag wins; absent, it tracks
  // isTesting (test runs disable animations by default).
  get isDisableAnimations(): boolean {
    const constants = resolveConstants()
    return constants?.isDisableAnimations ?? constants?.isTesting ?? false
  },

  get isMacCatalyst(): boolean {
    return resolveConstants()?.isMacCatalyst ?? false
  },

  // RN's exact iOS precedence: ios -> native -> default. `in` (not truthiness) so an
  // explicit `undefined`/`false`/`0` under a present key still wins over default.
  select<T>(spec: PlatformSelectSpec<T>): T | undefined {
    if ('ios' in spec) return spec.ios
    if ('native' in spec) return spec.native
    return spec.default
  },
}
