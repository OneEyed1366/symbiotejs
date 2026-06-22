// Shared types for DrawerLayoutAndroid — the same Props/Handle contract the real
// Android build (drawer-layout-android.android.ts) and the off-Android fallback
// (drawer-layout-android.ts) both implement. Per ADR 0019 the filename selects the
// build; these types are platform-agnostic, so they live here and both files import
// them. No Platform.OS read anywhere.

import type { ReactNode } from 'react'
import type { ViewStyle } from './styles'

export type DrawerPosition = 'left' | 'right'

export type DrawerLockMode = 'unlocked' | 'locked-closed' | 'locked-open'

export type KeyboardDismissMode = 'none' | 'on-drag'

export type DrawerState = 'Idle' | 'Dragging' | 'Settling'

export interface DrawerSlideEvent {
  offset: number
}

export interface DrawerLayoutAndroidProps {
  drawerWidth?: number
  drawerPosition?: DrawerPosition
  drawerLockMode?: DrawerLockMode
  keyboardDismissMode?: KeyboardDismissMode
  drawerBackgroundColor?: string
  statusBarBackgroundColor?: string
  onDrawerOpen?: () => void
  onDrawerClose?: () => void
  onDrawerSlide?: (event: DrawerSlideEvent) => void
  onDrawerStateChanged?: (state: DrawerState) => void
  renderNavigationView: () => ReactNode
  style?: ViewStyle
  children?: ReactNode
}

// The imperative API a host ref hands back — RN's DrawerLayoutAndroidMethods, pared to
// the two drawer commands (measure/setNativeProps already ride the host instance).
export interface DrawerLayoutAndroidHandle {
  openDrawer(): void
  closeDrawer(): void
}
