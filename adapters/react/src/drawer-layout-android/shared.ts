// Shared types for DrawerLayoutAndroid: the same Props/Handle contract the real
// Android build (drawer-layout-android.android.ts) and the off-Android fallback
// (drawer-layout-android.ts) both implement. Per ADR 0019 the filename selects the
// build; these types are platform-agnostic, so they live here and both files import
// them. No Platform.OS read anywhere.

import type { ReactNode } from 'react';
import type { IAccessibilityProps, IAriaProps } from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '../styles';

export type IDrawerPosition = 'left' | 'right';

export type IDrawerLockMode = 'unlocked' | 'locked-closed' | 'locked-open';

export type IKeyboardDismissMode = 'none' | 'on-drag';

export type IDrawerState = 'Idle' | 'Dragging' | 'Settling';

export interface IDrawerSlideEvent {
  offset: number;
}

export interface IDrawerLayoutAndroidProps extends IAccessibilityProps, IAriaProps {
  drawerWidth?: number;
  drawerPosition?: IDrawerPosition;
  drawerLockMode?: IDrawerLockMode;
  keyboardDismissMode?: IKeyboardDismissMode;
  drawerBackgroundColor?: string;
  statusBarBackgroundColor?: string;
  onDrawerOpen?: () => void;
  onDrawerClose?: () => void;
  onDrawerSlide?: (event: IDrawerSlideEvent) => void;
  onDrawerStateChanged?: (state: IDrawerState) => void;
  renderNavigationView: () => ReactNode;
  style?: IStyleProp<IViewStyle>;
  children?: ReactNode;
}

// The imperative API a host ref hands back, RN's DrawerLayoutAndroidMethods, pared to
// the two drawer commands (measure/setNativeProps already ride the host instance).
export interface IDrawerLayoutAndroidHandle {
  openDrawer(): void;
  closeDrawer(): void;
}
