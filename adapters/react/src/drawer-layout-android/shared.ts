// Shared types for the React DrawerLayoutAndroid: the same Props/Handle contract the real Android
// build (index.android.ts) and the off-Android fallback (index.ts) both implement. The
// platform-agnostic enums + the imperative handle live in @symbiote/components (the single source of
// truth, shared verbatim with the Vue adapter); this file adds only the React-facing prop surface and
// re-exports the agnostic types so the barrel and both builds keep importing them from one local path.
// Per ADR 0019 the filename selects the build; no Platform.OS read anywhere.

import type { ReactNode } from 'react';
import type {
  IAccessibilityProps,
  IAriaProps,
  IDrawerLockMode,
  IDrawerPosition,
  IDrawerSlideEvent,
  IDrawerState,
  IKeyboardDismissMode,
} from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '../styles';

export type {
  IDrawerPosition,
  IDrawerLockMode,
  IKeyboardDismissMode,
  IDrawerState,
  IDrawerSlideEvent,
  IDrawerLayoutAndroidHandle,
} from '@symbiote/components';

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
