// Shared types for the Vue DrawerLayoutAndroid: the same Props/Handle contract the real Android
// build (index.android.ts) and the off-Android fallback (index.ts) both implement. The
// platform-agnostic enums + the imperative handle live in @symbiote/components (shared verbatim with
// the React adapter, the single source of truth); this file adds only the Vue-facing prop surface.
// Per ADR 0019 the filename selects the build; no Platform.OS read anywhere.

import type { IStyleProp, IViewStyle } from '@symbiote/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  IDrawerLockMode,
  IDrawerPosition,
  IDrawerSlideEvent,
  IDrawerState,
  IKeyboardDismissMode,
} from '@symbiote/components';

export type {
  IDrawerPosition,
  IDrawerLockMode,
  IKeyboardDismissMode,
  IDrawerState,
  IDrawerSlideEvent,
  IDrawerLayoutAndroidHandle,
} from '@symbiote/components';

// The Vue-facing prop surface. React's IDrawerLayoutAndroidProps carries `renderNavigationView: () =>
// ReactNode` and `children?: ReactNode`; Vue takes BOTH via slots — content is the DEFAULT slot and
// the drawer is the `navigationView` slot, the Vue twin of React's children / renderNavigationView —
// so this mirrors the same surface minus those two, exactly as Vue's IModalProps drops React's
// `children`.
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
  style?: IStyleProp<IViewStyle>;
}
