// Headless proof of the Platform API — no simulator. We install a fake
// PlatformConstants native module behind BOTH bridge paths getNativeModule reads
// (__turboModuleProxy the function, and nativeModuleProxy[name] the HostObject),
// then assert Platform mirrors RN's iOS shape: OS is the static 'ios', select
// follows ios -> native -> default precedence, and Version/isPad reflect the faked
// getConstants() payload. A failure here is in JS, not native.

// Reach the source directly — Platform isn't on the barrel yet (the parent wires
// exports) and the headless harness has no built dist.
import { Platform, type PlatformConstantsIOS } from '../../core/engine/src/platform'

// The values we feed the fake native module and read back through Platform.
const FAKE_OS_VERSION = '17.4'
const FAKE_IDIOM = 'pad'

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined
}

// ---- fake PlatformConstants native module + bridge globals --------------

const fakeConstants: PlatformConstantsIOS = {
  forceTouchAvailable: false,
  interfaceIdiom: FAKE_IDIOM,
  isTesting: false,
  osVersion: FAKE_OS_VERSION,
  systemName: 'iOS',
  reactNativeVersion: { major: 0, minor: 0, patch: 0, prerelease: null },
}

const fakePlatformConstants = {
  getConstants: (): PlatformConstantsIOS => fakeConstants,
}

const registeredModules: Record<string, unknown> = { PlatformConstants: fakePlatformConstants }

Object.assign(globalThis, {
  // Non-bridgeless: the function proxy. Trailing comma on the type param so a bare
  // <T> in a .tsx file isn't read as JSX.
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name]
    if (!isType<T>(module)) return null
    return module
  },
  // Bridgeless fallback: the HostObject keyed by module name. We fake both paths so
  // the test exercises whichever getNativeModule resolves first.
  nativeModuleProxy: registeredModules,
})

// ---- run ----------------------------------------------------------------

if (Platform.OS !== 'ios') {
  throw new Error(`Platform.OS should be 'ios', got ${JSON.stringify(Platform.OS)}`)
}

{
  const picked = Platform.select({ ios: 'A', android: 'B' })
  if (picked !== 'A') {
    throw new Error(`select should pick ios 'A', got ${JSON.stringify(picked)}`)
  }
}

{
  const picked = Platform.select({ android: 'B', default: 'D' })
  if (picked !== 'D') {
    throw new Error(`select should fall back to default 'D', got ${JSON.stringify(picked)}`)
  }
}

{
  const picked = Platform.select({ native: 'N', default: 'D' })
  if (picked !== 'N') {
    throw new Error(`select should pick native 'N' over default, got ${JSON.stringify(picked)}`)
  }
}

if (Platform.Version !== FAKE_OS_VERSION) {
  throw new Error(`Version should reflect faked osVersion, got ${JSON.stringify(Platform.Version)}`)
}

if (Platform.isPad !== true) {
  throw new Error(`isPad should be true for interfaceIdiom 'pad', got ${JSON.stringify(Platform.isPad)}`)
}

if (Platform.isTV !== false) {
  throw new Error(`isTV should be false for interfaceIdiom 'pad', got ${JSON.stringify(Platform.isTV)}`)
}

console.log('platform.smoke OK')
