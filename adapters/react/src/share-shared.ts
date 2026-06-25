// Shared core of the Share module — only what does NOT differ by platform: the public
// types (ShareContent / ShareOptions / ShareAction), the public contract (ShareStatic),
// and the content invariant. Share is almost entirely divergent — one method, a totally
// different native call per platform — so there is no shared factory: each platform file
// (share.ios.ts / share.android.ts) implements `share()` fully against its own module.
//
// Metro selects the platform file on a real host (share.android.ts > share.ts); the base
// share.ts re-exports the iOS build for web/headless. There is no runtime `Platform.OS`
// read — the filename is the selector. See ADR 0019.

// RN's ShareContent: a url OR a message is required (title always optional).
export type ShareContent =
  | { title?: string; url: string; message?: string }
  | { title?: string; url?: string; message: string }

// RN's ShareOptions. `dialogTitle` is Android-only — accepted for API parity but unused
// on iOS; the rest map straight onto the iOS native share options.
export interface ShareOptions {
  dialogTitle?: string
  subject?: string
  excludedActivityTypes?: string[]
  tintColor?: unknown
  anchor?: number
}

// RN's Share action constants (RN Share.js ~173/179). These back the documented
// `result.action === Share.dismissedAction` pattern. True statically-known literals,
// so CONSTANT_CASE; the public fields (Share.sharedAction / Share.dismissedAction) are
// lowerCamel, assigned from these below.
export const SHARED_ACTION = 'sharedAction'
export const DISMISSED_ACTION = 'dismissedAction'

// RN's ShareAction — the resolved shape. The action literals must agree with the
// constants above.
export interface ShareAction {
  action: typeof SHARED_ACTION | typeof DISMISSED_ACTION
  activityType?: string | null
}

// What every platform's Share exposes to app code, including the action constants both
// platform builds spread onto their Share object (so app code can compare against
// Share.dismissedAction / Share.sharedAction).
export interface ShareStatic {
  share(content: ShareContent, options?: ShareOptions): Promise<ShareAction>
  sharedAction: typeof SHARED_ACTION
  dismissedAction: typeof DISMISSED_ACTION
}

// The constant fields every platform's Share exposes — spread onto the platform Share
// object so both builds carry them identically.
export const shareActions: {
  sharedAction: typeof SHARED_ACTION
  dismissedAction: typeof DISMISSED_ACTION
} = {
  sharedAction: SHARED_ACTION,
  dismissedAction: DISMISSED_ACTION,
}

// RN's invariant — return an Error (caller rejects rather than throws) so a bad call
// can't unmount the tree on device. Shared because the rule is identical per platform.
export function validateContent(content: ShareContent): Error | null {
  if (typeof content !== 'object' || content === null) {
    return new Error('Content to share must be a valid object')
  }
  if (typeof content.url !== 'string' && typeof content.message !== 'string') {
    return new Error('At least one of URL or message is required')
  }
  return null
}
