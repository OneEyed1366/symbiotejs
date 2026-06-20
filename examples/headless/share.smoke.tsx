// Headless proof of the Share module — JS->native only, no simulator. On iOS the
// share sheet is driven by ActionSheetManager.showShareActionSheetWithOptions (there
// is NO ShareModule on iOS — that's the Android module), so we fake ActionSheetManager
// and drive its success/dismiss callbacks. We assert a completed share resolves to
// { action: 'sharedAction', activityType }, a dismissed share resolves to
// 'dismissedAction', and invalid content (neither message nor url) rejects. A failure
// here is in JS, not native.

import { Share, type ShareContent } from '../../packages/react/src/share'

// ---- fake native module --------------------------------------------------

const SHARED_ACTIVITY = 'com.apple.UIKit.activity.PostToTwitter'

// `completed` decides which callback path runs; the test flips it per case.
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

const registeredModules: Record<string, unknown> = {
  ActionSheetManager: fakeActionSheetManager,
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
  // Completed share -> resolves to { action: 'sharedAction', activityType }.
  completeNextShare = true
  const shared = await Share.share({ message: 'hi', url: 'https://x' })
  if (shared.action !== 'sharedAction') {
    throw new Error(`completed share should resolve 'sharedAction', got ${String(shared.action)}`)
  }
  if (shared.activityType !== SHARED_ACTIVITY) {
    throw new Error(`completed share should carry activityType, got ${String(shared.activityType)}`)
  }

  // Dismissed share -> resolves to { action: 'dismissedAction', activityType: null }.
  completeNextShare = false
  const dismissed = await Share.share({ message: 'hi' })
  if (dismissed.action !== 'dismissedAction') {
    throw new Error(`dismissed share should resolve 'dismissedAction', got ${String(dismissed.action)}`)
  }

  // Invalid content (neither message nor url) -> rejects. JSON.parse yields an
  // untyped value so we can feed the deliberately-invalid shape without a cast.
  const invalidContent: ShareContent = JSON.parse('{"title":"only a title"}')
  let rejected = false
  await Share.share(invalidContent).catch(() => {
    rejected = true
  })
  if (!rejected) throw new Error('share with neither message nor url must reject')

  console.log('share.smoke OK')
}

main().catch((error) => {
  throw error
})
