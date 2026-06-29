// DrawerLayoutAndroid: the framework-agnostic view (style/prop) math. AndroidDrawerLayout is an
// ordinary Fabric host node committing through the same childSet as the rest of the tree (like
// Modal / Switch): a content wrapper FIRST and a navigation wrapper SECOND, mirroring RN's android
// render order {childrenWrapper}{drawerViewWrapper}. This builds the host prop bag + the two wrapper
// styles from the resolved props; the adapter overlays its ref + the wrapped event handlers and
// supplies the framework children / navigation elements. The logic half (event normalization,
// imperative handle, constants, types) lives in state/drawer-layout-android.ts.

import type { IStyleProp, IViewStyle } from '@symbiote/engine';
import {
  DEFAULT_DRAWER_BACKGROUND_COLOR,
  DEFAULT_DRAWER_POSITION,
  DRAWER_VIEW_NAME,
  type IDrawerLockMode,
  type IDrawerPosition,
  type IKeyboardDismissMode,
} from '../state/drawer-layout-android';

// RN styles.base on the host: flex:1 plus the Android drop-shadow that floats the drawer over
// content (android styles.base { flex:1, elevation:16 }).
export const DRAWER_HOST_STYLE: Readonly<IViewStyle> = {
  flex: 1,
  elevation: 16,
};

// RN styles.mainSubview: the content wrapper fills the host (absolute, all edges 0).
export const DRAWER_MAIN_SUBVIEW_STYLE: Readonly<IViewStyle> = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

// RN styles.drawerSubview: the navigation wrapper is absolute and full-height; its width comes from
// drawerWidth and its background from drawerBackgroundColor (both folded in by resolveDrawerLayout).
const DRAWER_SUBVIEW_STYLE: Readonly<IViewStyle> = {
  position: 'absolute',
  top: 0,
  bottom: 0,
};

export interface IDrawerLayoutResolveInput {
  drawerWidth?: number;
  drawerPosition?: IDrawerPosition;
  drawerLockMode?: IDrawerLockMode;
  keyboardDismissMode?: IKeyboardDismissMode;
  drawerBackgroundColor?: string;
  statusBarBackgroundColor?: string;
  // RN tracks drawerOpened to gate the navigation wrapper's pointerEvents: closed -> 'none' so the
  // off-screen drawer never intercepts touches; open -> 'auto'.
  drawerOpened: boolean;
  style?: IStyleProp<IViewStyle>;
  // The accessibility-resolved pass-through bag (testID, accessibility*, …). The drawer renders a raw
  // host node (not the View FC), so the adapter folds aria-*/role itself before passing it here.
  passthrough: Record<string, unknown>;
}

export interface IDrawerLayoutResolved {
  viewName: string;
  hostProps: Record<string, unknown>;
  contentWrapperStyle: Readonly<IViewStyle>;
  navigationWrapperStyle: IViewStyle;
  navigationPointerEvents: 'auto' | 'none';
}

// Build the AndroidDrawerLayout host prop bag + the two wrapper styles from the resolved props. The
// adapter overlays its ref + the four wrapped event handlers (onDrawerOpen / Close / Slide /
// StateChanged) and nests [contentWrapper, navigationWrapper] under the host IN THAT ORDER.
export function resolveDrawerLayout(input: IDrawerLayoutResolveInput): IDrawerLayoutResolved {
  const drawerBackgroundColor = input.drawerBackgroundColor ?? DEFAULT_DRAWER_BACKGROUND_COLOR;
  const hostProps: Record<string, unknown> = {
    ...input.passthrough,
    drawerWidth: input.drawerWidth,
    drawerPosition: input.drawerPosition ?? DEFAULT_DRAWER_POSITION,
    drawerLockMode: input.drawerLockMode,
    keyboardDismissMode: input.keyboardDismissMode,
    drawerBackgroundColor,
    statusBarBackgroundColor: input.statusBarBackgroundColor,
    style: [DRAWER_HOST_STYLE, input.style],
  };
  return {
    viewName: DRAWER_VIEW_NAME,
    hostProps,
    contentWrapperStyle: DRAWER_MAIN_SUBVIEW_STYLE,
    navigationWrapperStyle: {
      ...DRAWER_SUBVIEW_STYLE,
      width: input.drawerWidth,
      backgroundColor: drawerBackgroundColor,
    },
    navigationPointerEvents: input.drawerOpened ? 'auto' : 'none',
  };
}
