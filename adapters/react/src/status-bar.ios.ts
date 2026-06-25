// StatusBar on iOS — drives the iOS `StatusBarManager` TurboModule from its props
// (and from static methods). The native contract is RN's spec at
// .vendors/react-native/.../src/private/specs_DEPRECATED/modules/NativeStatusBarManagerIOS.js:
//   setStyle(statusBarStyle?: string, animated: boolean)
//   setHidden(hidden: boolean, withAnimation: 'none' | 'fade' | 'slide')
//   setNetworkActivityIndicatorVisible(visible: boolean)
// We mirror only those three setters as our hand-written interface — the typed trust
// boundary getNativeModule<T> resolves against. Metro picks this on an iOS host.

import { useEffect } from 'react'
import { dlog, getNativeModule } from '@symbiote/engine'
import {
  STATUS_BAR_MANAGER,
  STATIC_HIDE_TRANSITION,
  hideTransition,
  type StatusBarAnimation,
  type StatusBarComponent,
  type StatusBarStyle,
} from './status-bar-shared'
export type { StatusBarProps, StatusBarStyle } from './status-bar-shared'

// The native module typed as the interface we vouch for — only the setters we use.
// This is the single point that accepts the native shape (no per-call `as`).
interface NativeStatusBarManager {
  setStyle(statusBarStyle: StatusBarStyle, animated: boolean): void
  setHidden(hidden: boolean, withAnimation: StatusBarAnimation): void
  setNetworkActivityIndicatorVisible(visible: boolean): void
}

// StatusBar renders null and applies its props to the native module in an effect,
// on mount and on every prop change. Simplification vs RN: RN maintains a
// prop-merge stack so nested StatusBars compose (deepest/last wins) — we direct-apply
// a single component's props, which is correct for one StatusBar and a fine first cut.
export const StatusBar: StatusBarComponent = (props) => {
  const { barStyle, hidden, animated = false, networkActivityIndicatorVisible } = props

  useEffect(() => {
    // Resolve lazily inside the effect, not at import — keeps this module importable
    // headless before a fake __turboModuleProxy is installed. Non-enforcing: a
    // declarative StatusBar must NOT crash the whole render if the module can't resolve.
    const manager = getNativeModule<NativeStatusBarManager>(STATUS_BAR_MANAGER)
    if (manager === null) {
      dlog('StatusBar: StatusBarManager not resolvable via __turboModuleProxy — skipping')
      return
    }
    dlog('StatusBar -> applying props to StatusBarManager')

    if (barStyle !== undefined) manager.setStyle(barStyle, animated)
    if (hidden !== undefined) manager.setHidden(hidden, hideTransition(animated))
    if (networkActivityIndicatorVisible !== undefined) {
      manager.setNetworkActivityIndicatorVisible(networkActivityIndicatorVisible)
    }
  }, [barStyle, hidden, animated, networkActivityIndicatorVisible])

  return null
}

// The static API mirrors the declarative component: non-throwing — a missing optional
// native module is a no-op, never a crash.
StatusBar.setBarStyle = (style, animated = false) => {
  dlog('StatusBar.setBarStyle')
  getNativeModule<NativeStatusBarManager>(STATUS_BAR_MANAGER)?.setStyle(style, animated)
}

StatusBar.setHidden = (hidden, animation = STATIC_HIDE_TRANSITION) => {
  dlog('StatusBar.setHidden')
  getNativeModule<NativeStatusBarManager>(STATUS_BAR_MANAGER)?.setHidden(hidden, animation)
}

StatusBar.setNetworkActivityIndicatorVisible = (visible) => {
  dlog('StatusBar.setNetworkActivityIndicatorVisible')
  getNativeModule<NativeStatusBarManager>(STATUS_BAR_MANAGER)?.setNetworkActivityIndicatorVisible(
    visible,
  )
}

// Android-only on RN — inert on iOS (the iOS status bar has no background color and
// is never translucent in RN's sense). Present so the contract is platform-uniform.
StatusBar.setBackgroundColor = () => {
  dlog('StatusBar.setBackgroundColor (ios no-op)')
}
StatusBar.setTranslucent = () => {
  dlog('StatusBar.setTranslucent (ios no-op)')
}
// currentHeight is Android-only; absent on iOS (RN sets it to null on iOS).
