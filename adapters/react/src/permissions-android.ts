// PermissionsAndroid module — JS wrapper over Android's runtime-permissions
// model. Mirrors RN's Libraries/PermissionsAndroid/PermissionsAndroid.js,
// exposing the modern API: check / request / requestMultiple /
// shouldShowRequestPermissionRationale, plus the frozen PERMISSIONS and RESULTS
// constant maps. Imperative JS->native calls with no Fabric view of their own,
// like Vibration / Keyboard.
//
// symbiote is iOS-first and this module is Android-only, so it MUST degrade
// gracefully when the native module is absent (on iOS, or headless). RN throws
// "works only for Android"; we instead resolve a safe default + dlog so a
// cross-platform smoke never hard-crashes the process — never reject/throw
// synchronously on a missing module.
//
// The native contract is confirmed from RN's TurboModule spec at
// specs_DEPRECATED/modules/NativePermissionsAndroid.js (`'PermissionsAndroid'`):
//   checkPermission(permission): Promise<boolean>
//   requestPermission(permission): Promise<string>
//   shouldShowRequestPermissionRationale(permission): Promise<boolean>
//   requestMultiplePermissions(permissions): Promise<{[permission]: string}>

import { dlog, getNativeModule } from '@symbiote/engine'

// The native module name RN registers this TurboModule under
// (`TurboModuleRegistry.get<Spec>('PermissionsAndroid')`). NOTE: per the
// symbiote invariant, a module name is only provable on a real host (a headless
// fake answers to any name); this name is device-verify-pending. See
// .docs/native-module-platform-routing.md.
const PERMISSIONS_ANDROID_MODULE = 'PermissionsAndroid'

// The runtime-permission result strings Android can return. Modeled as a frozen
// `as const` map — the generated-style constant-map exception to "no magic
// strings".
export const RESULTS = Object.freeze({
  GRANTED: 'granted',
  DENIED: 'denied',
  NEVER_ASK_AGAIN: 'never_ask_again',
} as const)

export type PermissionStatus = (typeof RESULTS)[keyof typeof RESULTS]

// The full Android permission-string map, copied verbatim from RN's source.
// Frozen `as const` constant map (the same string-map exception as RESULTS).
export const PERMISSIONS = Object.freeze({
  READ_CALENDAR: 'android.permission.READ_CALENDAR',
  WRITE_CALENDAR: 'android.permission.WRITE_CALENDAR',
  CAMERA: 'android.permission.CAMERA',
  READ_CONTACTS: 'android.permission.READ_CONTACTS',
  WRITE_CONTACTS: 'android.permission.WRITE_CONTACTS',
  GET_ACCOUNTS: 'android.permission.GET_ACCOUNTS',
  ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
  ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
  ACCESS_BACKGROUND_LOCATION: 'android.permission.ACCESS_BACKGROUND_LOCATION',
  RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
  READ_PHONE_STATE: 'android.permission.READ_PHONE_STATE',
  CALL_PHONE: 'android.permission.CALL_PHONE',
  READ_CALL_LOG: 'android.permission.READ_CALL_LOG',
  WRITE_CALL_LOG: 'android.permission.WRITE_CALL_LOG',
  ADD_VOICEMAIL: 'com.android.voicemail.permission.ADD_VOICEMAIL',
  READ_VOICEMAIL: 'com.android.voicemail.permission.READ_VOICEMAIL',
  WRITE_VOICEMAIL: 'com.android.voicemail.permission.WRITE_VOICEMAIL',
  USE_SIP: 'android.permission.USE_SIP',
  PROCESS_OUTGOING_CALLS: 'android.permission.PROCESS_OUTGOING_CALLS',
  BODY_SENSORS: 'android.permission.BODY_SENSORS',
  BODY_SENSORS_BACKGROUND: 'android.permission.BODY_SENSORS_BACKGROUND',
  SEND_SMS: 'android.permission.SEND_SMS',
  RECEIVE_SMS: 'android.permission.RECEIVE_SMS',
  READ_SMS: 'android.permission.READ_SMS',
  RECEIVE_WAP_PUSH: 'android.permission.RECEIVE_WAP_PUSH',
  RECEIVE_MMS: 'android.permission.RECEIVE_MMS',
  READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
  READ_MEDIA_IMAGES: 'android.permission.READ_MEDIA_IMAGES',
  READ_MEDIA_VIDEO: 'android.permission.READ_MEDIA_VIDEO',
  READ_MEDIA_AUDIO: 'android.permission.READ_MEDIA_AUDIO',
  READ_MEDIA_VISUAL_USER_SELECTED: 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
  BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
  BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
  BLUETOOTH_ADVERTISE: 'android.permission.BLUETOOTH_ADVERTISE',
  ACCESS_MEDIA_LOCATION: 'android.permission.ACCESS_MEDIA_LOCATION',
  ACCEPT_HANDOVER: 'android.permission.ACCEPT_HANDOVER',
  ACTIVITY_RECOGNITION: 'android.permission.ACTIVITY_RECOGNITION',
  ANSWER_PHONE_CALLS: 'android.permission.ANSWER_PHONE_CALLS',
  READ_PHONE_NUMBERS: 'android.permission.READ_PHONE_NUMBERS',
  UWB_RANGING: 'android.permission.UWB_RANGING',
  POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
  NEARBY_WIFI_DEVICES: 'android.permission.NEARBY_WIFI_DEVICES',
} as const)

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

// The optional rationale dialog passed to request(). In RN this is shown via a
// SECOND native module (DialogManagerAndroid); symbiote keeps it simple and
// proceeds straight to the native request when that module is absent (see below).
export type Rationale = {
  title: string
  message: string
  buttonPositive?: string
  buttonNegative?: string
  buttonNeutral?: string
}

// The PermissionsAndroid native module typed as the interface we vouch for — the
// single point that accepts the native shape (no per-call `as`).
interface NativePermissionsAndroid {
  checkPermission(permission: string): Promise<unknown>
  requestPermission(permission: string): Promise<unknown>
  shouldShowRequestPermissionRationale(permission: string): Promise<unknown>
  requestMultiplePermissions(permissions: string[]): Promise<unknown>
}

// The DialogManagerAndroid native module that shows the rationale dialog. Typed
// minimally — symbiote uses only showAlert, and only opportunistically.
interface NativeDialogManagerAndroid {
  showAlert(options: Rationale, onError: () => void, onAction: () => void): void
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

// Narrow the native string result into a known RESULTS value. Any unrecognized
// string is passed through as a PermissionStatus only when it matches; otherwise
// we fall back to DENIED — a runtime guard at the trust boundary, not an `as`.
function toPermissionStatus(value: unknown): PermissionStatus {
  if (value === RESULTS.GRANTED || value === RESULTS.DENIED || value === RESULTS.NEVER_ASK_AGAIN) {
    return value
  }
  return RESULTS.DENIED
}

// Narrow the native requestMultiplePermissions() return into a per-permission
// status map. Each value is run through toPermissionStatus; non-object returns
// yield an empty map.
function toStatusMap(value: unknown): Record<string, PermissionStatus> {
  const result: Record<string, PermissionStatus> = {}
  if (typeof value !== 'object' || value === null) return result
  for (const key of Object.keys(value)) {
    result[key] = toPermissionStatus(Reflect.get(value, key))
  }
  return result
}

// Resolved lazily — null when the module isn't linked (iOS / headless).
const permissionsModule = getNativeModule<NativePermissionsAndroid>(PERMISSIONS_ANDROID_MODULE)
dlog(`PermissionsAndroid: module ${permissionsModule ? 'resolved' : 'NOT resolved (null)'}`)

export const PermissionsAndroid = {
  PERMISSIONS,
  RESULTS,

  // Resolve whether a permission has already been granted. Without a native
  // module (iOS / headless) resolve false — never throw.
  async check(permission: Permission): Promise<boolean> {
    if (permissionsModule === null) {
      dlog('PermissionsAndroid.check -> module unavailable, resolving false')
      return false
    }
    dlog(`PermissionsAndroid.check -> ${permission}`)
    const granted = await permissionsModule.checkPermission(permission)
    return isBoolean(granted) ? granted : false
  },

  // Prompt the user for a permission, resolving a RESULTS status. If a rationale
  // is supplied and DialogManagerAndroid is present, show it first; otherwise
  // proceed straight to the native request (dlog the skip). Without the
  // PermissionsAndroid module resolve RESULTS.DENIED — never throw.
  async request(permission: Permission, rationale?: Rationale): Promise<PermissionStatus> {
    if (permissionsModule === null) {
      dlog('PermissionsAndroid.request -> module unavailable, resolving DENIED')
      return RESULTS.DENIED
    }
    dlog(`PermissionsAndroid.request -> ${permission}`)

    if (rationale !== undefined) {
      const shouldShow = await permissionsModule.shouldShowRequestPermissionRationale(permission)
      const dialogModule = getNativeModule<NativeDialogManagerAndroid>('DialogManagerAndroid')
      if (isBoolean(shouldShow) && shouldShow && dialogModule !== null) {
        return new Promise((resolve, reject) => {
          dialogModule.showAlert(
            rationale,
            () => reject(new Error('Error showing rationale')),
            () => {
              permissionsModule
                .requestPermission(permission)
                .then((status) => resolve(toPermissionStatus(status)))
                .catch(reject)
            },
          )
        })
      }
      dlog('PermissionsAndroid.request -> rationale skipped (DialogManagerAndroid unavailable)')
    }

    const status = await permissionsModule.requestPermission(permission)
    return toPermissionStatus(status)
  },

  // Prompt for several permissions at once, resolving a per-permission status
  // map. Without a native module resolve an empty map — never throw.
  async requestMultiple(permissions: Permission[]): Promise<Record<string, PermissionStatus>> {
    if (permissionsModule === null) {
      dlog('PermissionsAndroid.requestMultiple -> module unavailable, resolving {}')
      return {}
    }
    dlog(`PermissionsAndroid.requestMultiple -> ${permissions.join(', ')}`)
    const statuses = await permissionsModule.requestMultiplePermissions(permissions)
    return toStatusMap(statuses)
  },

  // Whether the OS recommends showing a rationale before re-requesting. Without
  // a native module resolve false — never throw.
  async shouldShowRequestPermissionRationale(permission: Permission): Promise<boolean> {
    if (permissionsModule === null) {
      dlog('PermissionsAndroid.shouldShowRequestPermissionRationale -> module unavailable, resolving false')
      return false
    }
    dlog(`PermissionsAndroid.shouldShowRequestPermissionRationale -> ${permission}`)
    const shouldShow = await permissionsModule.shouldShowRequestPermissionRationale(permission)
    return isBoolean(shouldShow) ? shouldShow : false
  },
}
