// Share — iOS build. The native module is `ActionSheetManager` (there is NO ShareModule
// on iOS — that is the Android module); the share sheet is driven by its callback-style
// `showShareActionSheetWithOptions(options, failure, success)`. We validate content, map
// options onto the native share options, and resolve the ShareAction from the success
// callback. Metro picks this file on an iOS host; the base share.ts re-exports it for
// web/headless. See ADR 0019.

import { dlog, getNativeModule } from '@symbiote/engine'
import type { ShareActionSheetIOSOptions, ShareActionSheetError } from './action-sheet-ios'
import { validateContent, shareActions, SHARED_ACTION, DISMISSED_ACTION } from './share-shared'
import type { ShareContent, ShareOptions, ShareAction, ShareStatic } from './share-shared'

export type { ShareContent, ShareOptions, ShareAction } from './share-shared'

const ACTION_SHEET_MANAGER = 'ActionSheetManager'

// The one ActionSheetManager method Share needs, typed at the trust boundary (no per-call
// `as`; the generic on getNativeModule carries it).
interface ShareActionSheetManager {
  showShareActionSheetWithOptions(
    options: ShareActionSheetIOSOptions,
    failureCallback: (error: ShareActionSheetError) => void,
    successCallback: (completed: boolean, activityType?: string) => void,
  ): void
}

export const Share: ShareStatic = {
  ...shareActions,
  // Open the iOS share sheet for `content`. Resolves with the user's action
  // (sharedAction / dismissedAction); rejects on invalid content, a native failure,
  // or a missing module (explicit reject rather than a Promise that never settles).
  share(content: ShareContent, options: ShareOptions = {}): Promise<ShareAction> {
    const invalid = validateContent(content)
    if (invalid !== null) {
      dlog(`Share.share -> invalid content: ${invalid.message}`)
      return Promise.reject(invalid)
    }
    dlog('Share.share (ios)')
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
              ? { action: SHARED_ACTION, activityType: activityType ?? null }
              : { action: DISMISSED_ACTION, activityType: null },
          )
        },
      )
    })
  },
}
