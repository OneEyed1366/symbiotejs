// Share module — opens the native share sheet. Mirrors RN's Libraries/Share/Share.js
// iOS path. There is NO ShareModule on iOS (that is the Android native module); the
// iOS share sheet is driven by ActionSheetManager.showShareActionSheetWithOptions.
// We validate content (url or message required), call that native method, and map
// its success/dismiss callbacks onto the resolved Promise. No Fabric view — pure
// JS->native, async.
//
// Native contract from RN's Share.js (iOS branch) + the NativeActionSheetManager
// spec: showShareActionSheetWithOptions({ message, url, subject, tintColor, anchor,
//   excludedActivityTypes }, failure(error), success(completed, activityType)).

import { dlog, getNativeModule } from '@symbiote/shared'
import type { ShareActionSheetIOSOptions, ShareActionSheetError } from './action-sheet-ios'

// The iOS share sheet lives on the ActionSheetManager native module, not ShareModule.
const ACTION_SHEET_MANAGER = 'ActionSheetManager'

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
    dlog('Share.share')
    const manager = getNativeModule<ShareActionSheetManager>(ACTION_SHEET_MANAGER)
    if (manager === null) {
      dlog(`Share: "${ACTION_SHEET_MANAGER}" unresolved`)
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
