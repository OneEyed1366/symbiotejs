// Headless proof of the Share module — JS->native only, no simulator. Per ADR 0019 the
// platform builds are separate files (share.ios.ts / share.android.ts), so this imports
// each DIRECTLY — no Metro, no runtime Platform.OS toggle. The native module is
// platform-specific: the iOS build drives ActionSheetManager.showShareActionSheetWith-
// Options (there is NO ShareModule on iOS — that's the Android module); the Android build
// drives ShareModule.share. We fake both and drive each build:
//   iOS — completed share -> { action: 'sharedAction', activityType }, dismissed share ->
//     'dismissedAction', invalid content rejects.
//   Android — ShareModule.share(content, dialogTitle) resolves { action: 'sharedAction' }
//     -> { action: 'sharedAction', activityType: null }, forwarding content + dialogTitle.
// A failure here is in JS, not native.

import { Share as IosShare } from '../../adapters/react/src/share.ios'
import { Share as AndroidShare, type ShareContent } from '../../adapters/react/src/share.android'

// ---- fake native modules -------------------------------------------------

const SHARED_ACTIVITY = 'com.apple.UIKit.activity.PostToTwitter'

// `completed` decides which iOS callback path runs; the test flips it per case.
let completeNextShare = true

const fakeActionSheetManager = {
  showShareActionSheetWithOptions: (
    _options: Record<string, unknown>,
    _failureCallback: (error: { message: string }) => void,
    successCallback: (completed: boolean, activityType?: string) => void,
  ): void => {
    successCallback(completeNextShare, completeNextShare ? SHARED_ACTIVITY : undefined)
  },
}

// The Android fake records its last call so the test can assert content + dialogTitle
// were forwarded, then resolves the sharedAction shape ShareModule.share returns.
let lastAndroidShare: { content: { title?: string; message?: string }; dialogTitle?: string } | null = null

const fakeShareModule = {
  share: (content: { title?: string; message?: string }, dialogTitle?: string): Promise<{ action: string }> => {
    lastAndroidShare = { content, dialogTitle }
    return Promise.resolve({ action: 'sharedAction' })
  },
}

const registeredModules: Record<string, unknown> = {
  ActionSheetManager: fakeActionSheetManager,
  ShareModule: fakeShareModule,
}

Object.assign(globalThis, {
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name]
    if (module === undefined || module === null) return null
    if (!isType<T>(module)) return null
    return module
  },
})

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined
}

// ---- the smoke ----------------------------------------------------------

async function main(): Promise<void> {
  // === action constants — both builds expose them, backing the documented
  // `result.action === Share.dismissedAction` pattern (RN Share.js ~173/179) ===
  if (IosShare.dismissedAction !== 'dismissedAction') {
    throw new Error(`iOS Share.dismissedAction should be 'dismissedAction', got ${String(IosShare.dismissedAction)}`)
  }
  if (IosShare.sharedAction !== 'sharedAction') {
    throw new Error(`iOS Share.sharedAction should be 'sharedAction', got ${String(IosShare.sharedAction)}`)
  }
  if (AndroidShare.dismissedAction !== 'dismissedAction') {
    throw new Error(`Android Share.dismissedAction should be 'dismissedAction', got ${String(AndroidShare.dismissedAction)}`)
  }
  if (AndroidShare.sharedAction !== 'sharedAction') {
    throw new Error(`Android Share.sharedAction should be 'sharedAction', got ${String(AndroidShare.sharedAction)}`)
  }

  // === iOS build — routes to ActionSheetManager ===

  // Completed share -> resolves to { action: 'sharedAction', activityType }.
  completeNextShare = true
  const shared = await IosShare.share({ message: 'hi', url: 'https://x' })
  if (shared.action !== 'sharedAction') {
    throw new Error(`completed share should resolve 'sharedAction', got ${String(shared.action)}`)
  }
  if (shared.activityType !== SHARED_ACTIVITY) {
    throw new Error(`completed share should carry activityType, got ${String(shared.activityType)}`)
  }

  // Dismissed share -> resolves to { action: 'dismissedAction', activityType: null }.
  completeNextShare = false
  const dismissed = await IosShare.share({ message: 'hi' })
  if (dismissed.action !== 'dismissedAction') {
    throw new Error(`dismissed share should resolve 'dismissedAction', got ${String(dismissed.action)}`)
  }

  // Invalid content (neither message nor url) -> rejects. JSON.parse yields an
  // untyped value so we can feed the deliberately-invalid shape without a cast.
  const invalidContent: ShareContent = JSON.parse('{"title":"only a title"}')
  let rejected = false
  await IosShare.share(invalidContent).catch(() => {
    rejected = true
  })
  if (!rejected) throw new Error('share with neither message nor url must reject')

  // === Android build — routes to ShareModule, maps the result ===

  // share() forwards content + dialogTitle to ShareModule.share and maps
  // { action: 'sharedAction' } to the public shape with activityType: null.
  const androidResult = await AndroidShare.share({ title: 'T', message: 'body' }, { dialogTitle: 'Pick one' })
  if (androidResult.action !== 'sharedAction') {
    throw new Error(`android share should resolve 'sharedAction', got ${String(androidResult.action)}`)
  }
  if (androidResult.activityType !== null) {
    throw new Error(`android share should carry activityType: null, got ${String(androidResult.activityType)}`)
  }
  if (lastAndroidShare === null) {
    throw new Error('android share should call ShareModule.share')
  }
  if (lastAndroidShare.content.message !== 'body' || lastAndroidShare.content.title !== 'T') {
    throw new Error('android share should forward the content dict (title, message)')
  }
  if (lastAndroidShare.dialogTitle !== 'Pick one') {
    throw new Error('android share should forward options.dialogTitle')
  }

  console.log('share.smoke OK')
}

main().catch((error) => {
  throw error
})
