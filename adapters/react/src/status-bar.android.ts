// StatusBar on Android — drives the Android StatusBarManager from props (and from the
// static methods). Android's native module is a DIFFERENT shape from iOS: single-arg
// setHidden(hidden) / setStyle(style) plus setColor/setTranslucent — same module name
// ('StatusBarManager'). Metro picks this on an Android host; iOS keeps its own shape.
//
// History: this used to be a no-op. Driving the window flags from our bridgeless surface
// blanked the app — a status-bar relayout triggered stopSurface, which threw "Global was
// not installed" because RN installs global.RN$stopSurface from its own renderer, which we
// replace. Now that render.ts installs RN$stopSurface and tears surfaces down cleanly, the
// relayout survives and the bar updates without blanking (verified on device: show/hide +
// light/dark text). See render.ts installStopSurfaceGlobal + native-module-platform-routing.

import { useEffect } from 'react'
import { dlog, getNativeModule, processColor, type ColorValue } from '@symbiote/engine'
import { STATUS_BAR_MANAGER, type StatusBarComponent } from './status-bar-shared'
export type { StatusBarProps, StatusBarStyle } from './status-bar-shared'

// The native module typed as the interface we vouch for — only the Android setters we
// call. Single point that accepts the native shape (no per-call `as`). setColor takes a
// processed platform color int; getConstants().HEIGHT is the status-bar height (dp).
interface NativeStatusBarManagerAndroid {
  setHidden(hidden: boolean): void
  setStyle(statusBarStyle?: string): void
  setColor(color: number, animated: boolean): void
  setTranslucent(translucent: boolean): void
  getConstants?(): { HEIGHT?: number }
}

// processColor returns `unknown` (its result is platform-dependent); narrow to the
// number Fabric/native expects, like RN's invariant before setColor. A non-number
// (null for an unparseable color, headless identity passthrough of a string) is dropped.
function applyBackgroundColor(
  manager: NativeStatusBarManagerAndroid,
  color: ColorValue,
  animated: boolean,
): void {
  const processed = processColor(color)
  if (typeof processed !== 'number') {
    dlog(`StatusBar android: backgroundColor ${String(color)} did not process to an int — skipping`)
    return
  }
  // RISK: driving the window background flag once blanked the bridgeless surface
  // (see header). Routed cleanly here but DEVICE-VERIFY-PENDING.
  dlog(`StatusBar android setColor -> ${processed} animated=${animated}`)
  manager.setColor(processed, animated)
}

// Renders null and applies its props to the native module in an effect, on mount and on
// every prop change — same contract as iOS, with the single-arg Android setters.
const StatusBarAndroid: StatusBarComponent = (props) => {
  const { barStyle, hidden, animated = false, backgroundColor, translucent } = props

  useEffect(() => {
    const manager = getNativeModule<NativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)
    if (manager === null) {
      dlog('StatusBar android: StatusBarManager not resolvable — skipping')
      return
    }
    dlog(
      `StatusBar android -> barStyle=${barStyle} hidden=${hidden} translucent=${translucent} bg=${String(backgroundColor)}`,
    )
    if (barStyle !== undefined) manager.setStyle(barStyle)
    if (hidden !== undefined) manager.setHidden(hidden)
    if (translucent !== undefined) manager.setTranslucent(translucent)
    if (backgroundColor !== undefined) applyBackgroundColor(manager, backgroundColor, animated)
  }, [barStyle, hidden, animated, backgroundColor, translucent])

  return null
}

StatusBarAndroid.setBarStyle = (style) => {
  dlog(`StatusBar.setBarStyle android ${style}`)
  getNativeModule<NativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)?.setStyle(style)
}
StatusBarAndroid.setHidden = (hidden) => {
  dlog(`StatusBar.setHidden android ${hidden}`)
  getNativeModule<NativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)?.setHidden(hidden)
}
StatusBarAndroid.setNetworkActivityIndicatorVisible = () => {
  // No Android equivalent — an iOS-only concept.
  dlog('StatusBar.setNetworkActivityIndicatorVisible (android no-op)')
}
StatusBarAndroid.setBackgroundColor = (color, animated = false) => {
  dlog(`StatusBar.setBackgroundColor android ${String(color)}`)
  const manager = getNativeModule<NativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)
  if (manager === null) return
  applyBackgroundColor(manager, color, animated)
}
StatusBarAndroid.setTranslucent = (translucent) => {
  // RISK: window translucent flag is device-verify-pending (may blank the surface).
  dlog(`StatusBar.setTranslucent android ${translucent}`)
  getNativeModule<NativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)?.setTranslucent(translucent)
}

// Android exposes the bar height as a native constant; undefined if the module or the
// constant is absent (older RN, or a fake that doesn't define getConstants). Read lazily
// (getter, not a value) so nothing touches native at import time.
Object.defineProperty(StatusBarAndroid, 'currentHeight', {
  get(): number | undefined {
    return getNativeModule<NativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)?.getConstants?.().HEIGHT
  },
  enumerable: true,
})

export const StatusBar = StatusBarAndroid
