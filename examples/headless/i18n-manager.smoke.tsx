// Headless proof of the I18nManager runtime module: it reads the native RTL
// constants eagerly at module load, exposes them via getConstants() and the plain
// `isRTL` / `doLeftAndRightSwapInRTL` fields, and routes the allow/force/swap
// setters straight to the native module. Constants are read at import time, so the
// fake native module is installed BEFORE the module is loaded (dynamic import).

interface NativeCall {
  method: string
  args: unknown[]
}
const nativeCalls: NativeCall[] = []
function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args })
  }
}

const fakeI18nManager = {
  getConstants: () => ({ isRTL: true, doLeftAndRightSwapInRTL: false, localeIdentifier: 'ar-EG' }),
  allowRTL: record('allowRTL'),
  forceRTL: record('forceRTL'),
  swapLeftAndRightInRTL: record('swapLeftAndRightInRTL'),
}
Object.assign(globalThis, {
  nativeModuleProxy: { I18nManager: fakeI18nManager },
})

function callsOf(method: string): NativeCall[] {
  return nativeCalls.filter((call) => call.method === method)
}

// Import AFTER the fake is installed — constants resolve at module load. Imported
// by relative path (not the barrel) so the module loads in isolation before the
// coordinator wires the @symbiote/react export.
const { I18nManager } = await import('../../adapters/react/src/i18n-manager.ts')

// ---- constants are read from the native getConstants() at load --------------

if (I18nManager.isRTL !== true) {
  throw new Error(`isRTL should mirror the native constant (true), got ${String(I18nManager.isRTL)}`)
}
if (I18nManager.doLeftAndRightSwapInRTL !== false) {
  throw new Error(
    `doLeftAndRightSwapInRTL should mirror the native constant (false), got ${String(I18nManager.doLeftAndRightSwapInRTL)}`,
  )
}

const constants = I18nManager.getConstants()
if (constants.isRTL !== true || constants.doLeftAndRightSwapInRTL !== false) {
  throw new Error(`getConstants() should return the native constants, got ${JSON.stringify(constants)}`)
}
if (constants.localeIdentifier !== 'ar-EG') {
  throw new Error(`getConstants() should carry localeIdentifier, got ${String(constants.localeIdentifier)}`)
}

// ---- setters route to the native module's same-named methods ----------------

I18nManager.allowRTL(true)
const allowCalls = callsOf('allowRTL')
if (allowCalls.length !== 1 || allowCalls[0].args[0] !== true) {
  throw new Error(`allowRTL(true) should invoke native allowRTL once with true, got ${JSON.stringify(allowCalls)}`)
}

I18nManager.forceRTL(false)
const forceCalls = callsOf('forceRTL')
if (forceCalls.length !== 1 || forceCalls[0].args[0] !== false) {
  throw new Error(`forceRTL(false) should invoke native forceRTL once with false, got ${JSON.stringify(forceCalls)}`)
}

I18nManager.swapLeftAndRightInRTL(true)
const swapCalls = callsOf('swapLeftAndRightInRTL')
if (swapCalls.length !== 1 || swapCalls[0].args[0] !== true) {
  throw new Error(
    `swapLeftAndRightInRTL(true) should invoke native swapLeftAndRightInRTL once with true, got ${JSON.stringify(swapCalls)}`,
  )
}

console.log('i18n-manager: constants mirror native (isRTL true), setters route to native module')
console.log('i18n-manager.smoke OK')
