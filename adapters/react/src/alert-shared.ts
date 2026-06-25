// Shared core of the Alert module — everything that does NOT differ by platform: the
// public contract (the type union, button shapes, AlertStatic), the Android button-key
// constant defaults, and the button-normalization helper. The per-platform files
// (alert.ios.ts / alert.android.ts) implement `alert()` fully against their own native
// module (iOS keeps `prompt` too); the two native call shapes are too divergent to share
// a factory. No native, no `Platform.OS` read here. See ADR 0019.

// The alert `type` strings the spec documents (iOS), as a closed union so a typo can't
// reach the native call. 'default' = no text input; the rest prompt.
export type AlertType = 'default' | 'plain-text' | 'secure-text' | 'login-password'

// The iOS button styles RN documents.
export type AlertButtonStyle = 'default' | 'cancel' | 'destructive'

export interface AlertButton {
  text?: string
  onPress?: (value?: string) => void
  isPreferred?: boolean
  style?: AlertButtonStyle
}

export type AlertButtons = AlertButton[]

export interface AlertOptions {
  cancelable?: boolean
  userInterfaceStyle?: 'unspecified' | 'light' | 'dark'
  onDismiss?: () => void
}

// What every platform's Alert exposes to app code. iOS additionally exposes `prompt`,
// but `alert` is the cross-platform surface, so the shared contract names only it.
export interface AlertStatic {
  alert(title?: string, message?: string, buttons?: AlertButtons, options?: AlertOptions): void
}

// The default positive label RN uses when a button carries no text.
export const DEFAULT_POSITIVE_TEXT = 'OK'

// Normalize the `buttons` arg into a consistent list: undefined/empty becomes a single
// default "OK" button, exactly as RN does before handing the list to native. Both
// platform files start from this so the no-buttons case behaves identically.
export function normalizeButtons(buttons?: AlertButtons): AlertButtons {
  if (buttons === undefined || buttons.length === 0) {
    return [{ text: DEFAULT_POSITIVE_TEXT }]
  }
  return buttons
}
