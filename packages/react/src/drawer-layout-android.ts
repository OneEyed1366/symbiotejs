// DrawerLayoutAndroid — base / off-Android fallback. AndroidDrawerLayout is Android-
// only, so everywhere except an Android host (where Metro picks
// drawer-layout-android.android.ts) we render the content in a plain container and drop
// the navigation view — RN's DrawerLayoutAndroidFallback shape. The imperative
// open/close are silent no-ops; there is no drawer to drive. The filename is the
// selector — no Platform.OS read. The barrel imports './drawer-layout-android', which
// resolves here under tsc/tsx and to the .android file under Metro. See ADR 0019.

import { createElement, forwardRef, useImperativeHandle } from 'react'
import { dlog } from '@symbiote/shared'
import { View } from './components'
import type {
  DrawerLayoutAndroidHandle,
  DrawerLayoutAndroidProps,
} from './drawer-layout-android-shared'

export type {
  DrawerPosition,
  DrawerLockMode,
  KeyboardDismissMode,
  DrawerState,
  DrawerSlideEvent,
  DrawerLayoutAndroidProps,
  DrawerLayoutAndroidHandle,
} from './drawer-layout-android-shared'

export const DrawerLayoutAndroid = forwardRef<
  DrawerLayoutAndroidHandle,
  DrawerLayoutAndroidProps
>((props, ref) => {
  const { style, children } = props

  useImperativeHandle(
    ref,
    () => ({
      openDrawer: () => dlog('DrawerLayoutAndroid.openDrawer no-op: off Android'),
      closeDrawer: () => dlog('DrawerLayoutAndroid.closeDrawer no-op: off Android'),
    }),
    [],
  )

  dlog('DrawerLayoutAndroid fallback: off-Android host, rendering content only')
  return createElement(View, { style }, children)
})
