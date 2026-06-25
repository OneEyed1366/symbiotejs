// Headless proof of the PermissionsAndroid runtime module: it resolves the native
// module lazily and routes check / request / requestMultiple /
// shouldShowRequestPermissionRationale to it, narrowing each native return at the
// trust boundary, and exposes the frozen PERMISSIONS / RESULTS constant maps. It
// MUST degrade gracefully (Android-only, symbiote is iOS-first): with no module
// faked, check resolves false and request resolves RESULTS.DENIED without throwing.
//
// The module is resolved lazily (not at import), so we can prove BOTH the
// module-present and module-absent paths in one process by faking, importing,
// then re-importing with a fresh module registry. To keep it simple here we run
// the absent path first (fresh import), then the present path with the fake.

interface NativeCall {
  method: string
  args: unknown[]
}
const nativeCalls: NativeCall[] = []
function record(method: string, ret: unknown): (...args: unknown[]) => Promise<unknown> {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args })
    return Promise.resolve(ret)
  }
}
function callsOf(method: string): NativeCall[] {
  return nativeCalls.filter((call) => call.method === method)
}

// ---- (e) absent module: safe defaults, no throw ------------------------------
// Import with NO native module installed. The module is resolved lazily, so this
// import sees a null module.
const absent = await import('../../adapters/react/src/permissions-android.ts')

const absentCheck = await absent.PermissionsAndroid.check(absent.PERMISSIONS.CAMERA)
if (absentCheck !== false) {
  throw new Error(`check with no module should resolve false, got ${String(absentCheck)}`)
}
const absentRequest = await absent.PermissionsAndroid.request(absent.PERMISSIONS.CAMERA)
if (absentRequest !== absent.RESULTS.DENIED) {
  throw new Error(`request with no module should resolve DENIED, got ${String(absentRequest)}`)
}
console.log('permissions-android: absent module -> check false, request DENIED (no throw)')

// ---- install the fake native module for the present-module path --------------
const fakePermissionsAndroid = {
  checkPermission: record('checkPermission', true),
  requestPermission: record('requestPermission', 'granted'),
  shouldShowRequestPermissionRationale: record('shouldShowRequestPermissionRationale', false),
  requestMultiplePermissions: record('requestMultiplePermissions', {
    'android.permission.CAMERA': 'granted',
    'android.permission.ACCESS_FINE_LOCATION': 'denied',
  }),
}
Object.assign(globalThis, {
  nativeModuleProxy: { PermissionsAndroid: fakePermissionsAndroid },
})

// Re-import with a cache-busting query so the module re-resolves and now sees the
// fake (getNativeModule runs at module load).
const present = await import('../../adapters/react/src/permissions-android.ts?present')
const { PermissionsAndroid, PERMISSIONS, RESULTS } = present

// ---- (d) constants are exposed -----------------------------------------------
if (RESULTS.GRANTED !== 'granted' || RESULTS.DENIED !== 'denied' || RESULTS.NEVER_ASK_AGAIN !== 'never_ask_again') {
  throw new Error(`RESULTS constants wrong, got ${JSON.stringify(RESULTS)}`)
}
if (PERMISSIONS.CAMERA !== 'android.permission.CAMERA') {
  throw new Error(`PERMISSIONS.CAMERA wrong, got ${String(PERMISSIONS.CAMERA)}`)
}
if (PERMISSIONS.ACCESS_FINE_LOCATION !== 'android.permission.ACCESS_FINE_LOCATION') {
  throw new Error(`PERMISSIONS.ACCESS_FINE_LOCATION wrong, got ${String(PERMISSIONS.ACCESS_FINE_LOCATION)}`)
}
if (PermissionsAndroid.PERMISSIONS.CAMERA !== 'android.permission.CAMERA') {
  throw new Error('PERMISSIONS should also be exposed on the instance')
}
if (PermissionsAndroid.RESULTS.GRANTED !== 'granted') {
  throw new Error('RESULTS should also be exposed on the instance')
}
console.log('permissions-android: PERMISSIONS / RESULTS constants exposed on module and instance')

// ---- (a) check resolves the native boolean -----------------------------------
const granted = await PermissionsAndroid.check(PERMISSIONS.CAMERA)
if (granted !== true) {
  throw new Error(`check should resolve the native boolean (true), got ${String(granted)}`)
}
const checkCalls = callsOf('checkPermission')
if (checkCalls.length !== 1 || checkCalls[0].args[0] !== 'android.permission.CAMERA') {
  throw new Error(`check should call native checkPermission once with the permission, got ${JSON.stringify(checkCalls)}`)
}

// ---- (b) request resolves the native RESULTS string --------------------------
const status = await PermissionsAndroid.request(PERMISSIONS.CAMERA)
if (status !== RESULTS.GRANTED) {
  throw new Error(`request should resolve the native RESULTS string (granted), got ${String(status)}`)
}
const requestCalls = callsOf('requestPermission')
if (requestCalls.length !== 1 || requestCalls[0].args[0] !== 'android.permission.CAMERA') {
  throw new Error(`request should call native requestPermission once, got ${JSON.stringify(requestCalls)}`)
}

// ---- (c) requestMultiple resolves the per-permission map ---------------------
const map = await PermissionsAndroid.requestMultiple([PERMISSIONS.CAMERA, PERMISSIONS.ACCESS_FINE_LOCATION])
if (map[PERMISSIONS.CAMERA] !== RESULTS.GRANTED || map[PERMISSIONS.ACCESS_FINE_LOCATION] !== RESULTS.DENIED) {
  throw new Error(`requestMultiple should resolve the per-permission map, got ${JSON.stringify(map)}`)
}
console.log('permissions-android: check/request/requestMultiple route to native and narrow results')

console.log('permissions-android.smoke OK')

export {}
