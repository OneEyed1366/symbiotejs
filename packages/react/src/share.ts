// Share module — opens the native share sheet. Mirrors RN's Libraries/Share/Share.js,
// both platform branches. The native module is platform-specific: on iOS the share
// sheet is driven by ActionSheetManager.showShareActionSheetWithOptions (there is NO
// ShareModule on iOS — that is the Android module); on Android it is ShareModule.share.
// We validate content (url or message required), call the platform's native method,
// and map its result onto the resolved Promise. No Fabric view — pure JS->native, async.
//
// Native contract:
//   iOS — ActionSheetManager.showShareActionSheetWithOptions({ message, url, subject,
//     tintColor, anchor, excludedActivityTypes }, failure(error),
//     success(completed, activityType)) (callback-style).
//   Android — ShareModule.share({ title?, message? }, dialogTitle?) -> Promise<{ action }>;
//     RN fills the missing activityType with null (sharedAction / dismissedAction).
//
// Per ADR 0018, the per-platform module selection is a Platform.OS branch in this one
// file, NOT a .ios.ts/.android.ts Metro split — the tsx smoke harness has no Metro
// platform resolution, so everything stays in one .ts.

import { dlog, getNativeModule, Platform } from '@symbiote/shared'
import type { PlatformOSType } from '@symbiote/shared'
import type { ShareActionSheetIOSOptions, ShareActionSheetError } from './action-sheet-ios'

// The native module per platform: iOS uses ActionSheetManager (the iOS share sheet
// lives there, not on ShareModule); Android uses ShareModule. The Android name is
// device-verify-pending — it matches NativeShareModule's TurboModuleRegistry.get
// ('ShareModule') but headless fakes resolve any name, so it is only proven on a real
// Android host (see .docs/native-module-platform-routing.md, ADR 0012).
const NATIVE_MODULE_BY_PLATFORM: Partial<Record<PlatformOSType, string>> = {
  ios: 'ActionSheetManager',
  android: 'ShareModule',
}

// RN's ShareContent: a url OR a message is required (title always optional).
export type ShareContent =
  | { title?: string; url: string; message?: string }
  | { title?: string; url?: string; message: string }

// RN's iOS ShareOptions. `dialogTitle` is Android-only — accepted for API parity but
// unused on iOS; the rest map straight onto the native share options.
export interface ShareOptions {
  dialogTitle?: string
  subject?: string
  excludedActivityTypes?: string[]
  tintColor?: unknown
  anchor?: number
}

// RN's ShareAction — the resolved shape.
export interface ShareAction {
  action: 'sharedAction' | 'dismissedAction'
  activityType?: string | null
}

// The one ActionSheetManager method Share needs, typed at the trust boundary (no
// per-call `as`; the generic on getNativeModule carries it).
interface ShareActionSheetManager {
  showShareActionSheetWithOptions(
    options: ShareActionSheetIOSOptions,
    failureCallback: (error: ShareActionSheetError) => void,
    successCallback: (completed: boolean, activityType?: string) => void,
  ): void
}

// The Android ShareModule contract, from NativeShareModule's spec: share takes a
// content dict (title/message) plus the dialog title and resolves { action }. Android
// has no dismiss path — RN always resolves sharedAction.
interface ShareModuleAndroid {
  share(content: { title?: string; message?: string }, dialogTitle?: string): Promise<{ action: string }>
}

// ShareModule.share resolves an untyped value at the native boundary; narrow it before
// reading `action` (no `as`).
function isShareResult(value: unknown): value is { action: string } {
  return typeof value === 'object' && value !== null && 'action' in value && typeof value.action === 'string'
}

// RN's invariant — reject (not throw) so a bad call can't unmount the tree on device.
function validateContent(content: ShareContent): Error | null {
  if (typeof content !== 'object' || content === null) {
    return new Error('Content to share must be a valid object')
  }
  if (typeof content.url !== 'string' && typeof content.message !== 'string') {
    return new Error('At least one of URL or message is required')
  }
  return null
}

export const Share = {
  // Open the share sheet for `content`. Resolves with the user's action
  // (sharedAction / dismissedAction); rejects on invalid content, a native failure,
  // or a missing module (explicit reject rather than a Promise that never settles).
  share(content: ShareContent, options: ShareOptions = {}): Promise<ShareAction> {
    const invalid = validateContent(content)
    if (invalid !== null) {
      dlog(`Share.share -> invalid content: ${invalid.message}`)
      return Promise.reject(invalid)
    }
    dlog(`Share.share (os=${Platform.OS})`)
    const moduleName = NATIVE_MODULE_BY_PLATFORM[Platform.OS]
    if (moduleName === undefined) {
      dlog(`Share: unsupported platform "${Platform.OS}"`)
      return Promise.reject(new Error(`Share: unsupported platform "${Platform.OS}"`))
    }

    // Android: ShareModule.share(content, dialogTitle) -> Promise<{ action }>; mirror
    // RN's Share.js Android branch — build the content dict, then fill activityType: null.
    if (Platform.OS === 'android') {
      const shareModule = getNativeModule<ShareModuleAndroid>(moduleName)
      if (shareModule === null) {
        dlog(`Share: "${moduleName}" unresolved`)
        return Promise.reject(new Error('Share: ShareModule native module unavailable'))
      }
      const newContent = {
        title: content.title,
        message: typeof content.message === 'string' ? content.message : undefined,
      }
      return shareModule.share(newContent, options.dialogTitle).then((result) => {
        if (!isShareResult(result)) {
          dlog('Share.share -> android result missing action')
          throw new Error('Share: ShareModule returned an unexpected result')
        }
        dlog(`Share.share -> android action=${result.action}`)
        return { action: result.action === 'dismissedAction' ? 'dismissedAction' : 'sharedAction', activityType: null }
      })
    }

    const manager = getNativeModule<ShareActionSheetManager>(moduleName)
    if (manager === null) {
      dlog(`Share: "${moduleName}" unresolved`)
      return Promise.reject(new Error('Share: ActionSheetManager native module unavailable'))
    }
    return new Promise((resolve, reject) => {
      manager.showShareActionSheetWithOptions(
        {
          message: typeof content.message === 'string' ? content.message : undefined,
          url: typeof content.url === 'string' ? content.url : undefined,
          subject: options.subject,
          tintColor: options.tintColor,
          anchor: options.anchor,
          excludedActivityTypes: options.excludedActivityTypes,
        },
        (error) => {
          dlog('Share.share -> failure')
          reject(new Error(error.message))
        },
        (completed, activityType) => {
          dlog(`Share.share -> success completed=${completed}`)
          resolve(
            completed
              ? { action: 'sharedAction', activityType: activityType ?? null }
              : { action: 'dismissedAction', activityType: null },
          )
        },
      )
    })
  },
}
