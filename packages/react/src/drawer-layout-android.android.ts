// DrawerLayoutAndroid — the real Android build. AndroidDrawerLayout is an ordinary
// Fabric host node: it lives in the SAME childSet and commits through the SAME
// completeRoot as the rest of the tree, exactly like Modal/Switch. There is no
// per-library glue — shared derives the view's events/processors from its ViewConfig,
// so we render the RAW Fabric name `AndroidDrawerLayout` (the derive-by-default path:
// any non-`symbiote-*` createElement type flows through untouched).
//
// Behavior mirrors RN's DrawerLayoutAndroid.android.js: the navigation view (from
// `renderNavigationView()`) and the main content are wrapped in two container Views,
// and — critically — the child order RN commits is [mainSubview, drawerSubview]: the
// content wrapper FIRST, the navigation wrapper SECOND (android render:
// {childrenWrapper}{drawerViewWrapper}). The navigation wrapper is absolutely
// positioned, drawerWidth-wide, and gated by pointerEvents so it stays untouchable
// until opened. `openDrawer`/`closeDrawer` are imperative, reached through a ref, and
// dispatched as the `openDrawer`/`closeDrawer` view commands against the host node —
// mirroring Switch's dispatchViewCommand path (Commands.openDrawer/closeDrawer in
// AndroidDrawerLayoutNativeComponent).
//
// Metro picks this file on an Android host; off Android the base drawer-layout-android.ts
// renders the fallback. No Platform.OS read — the filename is the selector (ADR 0019).
// device-verify-pending: the `AndroidDrawerLayout` name + the openDrawer/closeDrawer
// commands are RN-source-confirmed, not yet exercised on a real Android host.

import {
  createElement,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  dispatchViewCommand,
  dlog,
  type SymbioteEvent,
  type SymbioteNode,
} from '@symbiote/shared'
import { View } from './components'
import type { ViewStyle } from './styles'
import type {
  DrawerLayoutAndroidHandle,
  DrawerLayoutAndroidProps,
  DrawerPosition,
  DrawerState,
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

// The native view name registered by AndroidDrawerLayoutNativeComponent's
// codegenNativeComponent('AndroidDrawerLayout') — the derive-by-default name.
const DRAWER_VIEW_NAME = 'AndroidDrawerLayout'

const OPEN_DRAWER_COMMAND = 'openDrawer'
const CLOSE_DRAWER_COMMAND = 'closeDrawer'

// RN's drawerState int -> string mapping (android: DRAWER_STATES indexed by the native
// drawerState). 0=Idle, 1=Dragging, 2=Settling.
const DRAWER_STATES: ReadonlyArray<DrawerState> = ['Idle', 'Dragging', 'Settling']

const DEFAULT_DRAWER_BACKGROUND_COLOR = 'white'
const DEFAULT_DRAWER_POSITION: DrawerPosition = 'left'

// RN styles.base on the host: flex:1 plus the Android drop-shadow that floats the
// drawer over content (android styles.base { flex:1, elevation:16 }).
const HOST_STYLE: Readonly<ViewStyle> = {
  flex: 1,
  elevation: 16,
}

// RN styles.mainSubview — the content wrapper fills the host (absolute, all edges 0).
const MAIN_SUBVIEW_STYLE: Readonly<ViewStyle> = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
}

// RN styles.drawerSubview — the navigation wrapper is absolute and full-height; its
// width comes from drawerWidth and its background from drawerBackgroundColor.
const DRAWER_SUBVIEW_STYLE: Readonly<ViewStyle> = {
  position: 'absolute',
  top: 0,
  bottom: 0,
}

function offsetFromSlide(event: SymbioteEvent): number {
  const offset = event.nativeEvent.offset
  return typeof offset === 'number' ? offset : 0
}

function stateFromChange(event: SymbioteEvent): DrawerState {
  const index = event.nativeEvent.drawerState
  if (typeof index === 'number' && index >= 0 && index < DRAWER_STATES.length) {
    return DRAWER_STATES[index]
  }
  return 'Idle'
}

// Issue a drawer command against the committed host node, or log a silent no-op when
// there is no node yet (the first render has not committed).
function dispatchDrawerCommand(node: SymbioteNode | null, command: string): void {
  if (node === null) {
    dlog(`DrawerLayoutAndroid ${command} no-op: no committed host node`)
    return
  }
  dlog(`DrawerLayoutAndroid dispatch ${command}`)
  dispatchViewCommand(node, command, [])
}

export const DrawerLayoutAndroid = forwardRef<
  DrawerLayoutAndroidHandle,
  DrawerLayoutAndroidProps
>((props, ref) => {
  const {
    drawerWidth,
    drawerPosition,
    drawerLockMode,
    keyboardDismissMode,
    drawerBackgroundColor = DEFAULT_DRAWER_BACKGROUND_COLOR,
    statusBarBackgroundColor,
    onDrawerOpen,
    onDrawerClose,
    onDrawerSlide,
    onDrawerStateChanged,
    renderNavigationView,
    style,
    children,
    ...passthrough
  } = props

  const node = useRef<SymbioteNode | null>(null)
  // RN tracks drawerOpened to gate the navigation view's pointerEvents (android
  // _onDrawerOpen/_onDrawerClose setState). Closed -> 'none' so the off-screen drawer
  // never intercepts touches; open -> 'auto'.
  const [drawerOpened, setDrawerOpened] = useState(false)

  useImperativeHandle(
    ref,
    () => ({
      openDrawer: () => dispatchDrawerCommand(node.current, OPEN_DRAWER_COMMAND),
      closeDrawer: () => dispatchDrawerCommand(node.current, CLOSE_DRAWER_COMMAND),
    }),
    [],
  )

  const handleDrawerOpen = useCallback((): void => {
    dlog('DrawerLayoutAndroid onDrawerOpen')
    setDrawerOpened(true)
    onDrawerOpen?.()
  }, [onDrawerOpen])

  const handleDrawerClose = useCallback((): void => {
    dlog('DrawerLayoutAndroid onDrawerClose')
    setDrawerOpened(false)
    onDrawerClose?.()
  }, [onDrawerClose])

  const handleDrawerSlide = useCallback(
    (event: SymbioteEvent): void => {
      onDrawerSlide?.({ offset: offsetFromSlide(event) })
    },
    [onDrawerSlide],
  )

  const handleDrawerStateChanged = useCallback(
    (event: SymbioteEvent): void => {
      onDrawerStateChanged?.(stateFromChange(event))
    },
    [onDrawerStateChanged],
  )

  // RN's mainSubview: content wrapped in an absolute box.
  const contentWrapper = createElement(View, { style: MAIN_SUBVIEW_STYLE }, children)

  // RN's drawerSubview: the navigation view wrapped, drawerWidth-wide, painted with
  // drawerBackgroundColor, untouchable until opened.
  const navigationWrapper = createElement(
    View,
    {
      style: {
        ...DRAWER_SUBVIEW_STYLE,
        width: drawerWidth,
        backgroundColor: drawerBackgroundColor,
      },
      pointerEvents: drawerOpened ? 'auto' : 'none',
    },
    renderNavigationView(),
  )

  dlog(
    `DrawerLayoutAndroid render position=${drawerPosition ?? DEFAULT_DRAWER_POSITION} ` +
      `width=${String(drawerWidth)} opened=${drawerOpened}`,
  )

  // Child order matches RN exactly: content FIRST, navigation SECOND
  // (android render emits {childrenWrapper}{drawerViewWrapper}).
  return createElement(
    DRAWER_VIEW_NAME,
    {
      ...passthrough,
      ref: node,
      drawerWidth,
      drawerPosition: drawerPosition ?? DEFAULT_DRAWER_POSITION,
      drawerLockMode,
      keyboardDismissMode,
      drawerBackgroundColor,
      statusBarBackgroundColor,
      style: { ...HOST_STYLE, ...style },
      onDrawerOpen: handleDrawerOpen,
      onDrawerClose: handleDrawerClose,
      onDrawerSlide: handleDrawerSlide,
      onDrawerStateChanged: handleDrawerStateChanged,
    },
    contentWrapper,
    navigationWrapper,
  )
})
