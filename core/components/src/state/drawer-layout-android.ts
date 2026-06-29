// DrawerLayoutAndroid: the framework-agnostic logic half. AndroidDrawerLayout is Android-only, so
// this module holds only the platform-invariant contract every adapter shares — the drawer-position
// / lock-mode / keyboard-dismiss / state TYPES, the native view + command NAMES, the slide/state
// event NORMALIZATION, and the imperative open/close HANDLE. The adapter supplies only its lifecycle
// (refs / reactivity) + the descriptor→element bridge; the view (style/prop) math lives in
// view/render-drawer-layout-android.ts. No Platform.OS read; the adapter's filename selects the build
// (ADR 0019). The wolf-tui twin shape is the shared state module pulled out of each reconciler.

import {
  dispatchViewCommand,
  dlog,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote/engine';

export type IDrawerPosition = 'left' | 'right';

export type IDrawerLockMode = 'unlocked' | 'locked-closed' | 'locked-open';

export type IKeyboardDismissMode = 'none' | 'on-drag';

export type IDrawerState = 'Idle' | 'Dragging' | 'Settling';

export interface IDrawerSlideEvent {
  offset: number;
}

// The imperative API a host ref hands back (RN's DrawerLayoutAndroidMethods), pared to the two
// drawer commands; measure / setNativeProps already ride the host instance.
export interface IDrawerLayoutAndroidHandle {
  openDrawer(): void;
  closeDrawer(): void;
}

// The native view name registered by AndroidDrawerLayoutNativeComponent's
// codegenNativeComponent('AndroidDrawerLayout'): the derive-by-default name (any non-`symbiote-*`
// type flows through descriptorFor untouched, the engine deriving its events from the ViewConfig).
export const DRAWER_VIEW_NAME = 'AndroidDrawerLayout';

export const OPEN_DRAWER_COMMAND = 'openDrawer';
export const CLOSE_DRAWER_COMMAND = 'closeDrawer';

// RN's drawerState int -> string mapping (android DRAWER_STATES indexed by the native drawerState):
// 0=Idle, 1=Dragging, 2=Settling.
export const DRAWER_STATES: ReadonlyArray<IDrawerState> = ['Idle', 'Dragging', 'Settling'];

export const DEFAULT_DRAWER_BACKGROUND_COLOR = 'white';
export const DEFAULT_DRAWER_POSITION: IDrawerPosition = 'left';

// Slide-event normalization: pull the native drag offset (RN onDrawerSlide nativeEvent.offset).
export function offsetFromSlide(event: ISymbioteEvent): number {
  const offset = event.nativeEvent.offset;
  return typeof offset === 'number' ? offset : 0;
}

// State-change normalization: map the native drawerState int onto its DRAWER_STATES label.
export function stateFromChange(event: ISymbioteEvent): IDrawerState {
  const index = event.nativeEvent.drawerState;
  if (typeof index === 'number' && index >= 0 && index < DRAWER_STATES.length) {
    return DRAWER_STATES[index];
  }
  return 'Idle';
}

// Issue a drawer command against the committed host node, or log a silent no-op when there is no
// node yet (the first render has not committed). Mirrors Switch's dispatchViewCommand path.
export function dispatchDrawerCommand(node: ISymbioteNode | null, command: string): void {
  if (node === null) {
    dlog(`DrawerLayoutAndroid ${command} no-op: no committed host node`);
    return;
  }
  dlog(`DrawerLayoutAndroid dispatch ${command}`);
  dispatchViewCommand(node, command, []);
}

// The imperative handle is identical across adapters: openDrawer / closeDrawer dispatch the matching
// view command on the SAME host node. Built once here; each adapter backs it with its lazy node
// getter (React `() => ref.current`, Vue `() => nodeRef.value`), read on every call — the node is
// null until the element commits, so an eager capture would freeze null and every command no-op.
// The Vue twin of React's useImperativeHandle(ref, …); mirrors buildScrollViewHandle.
export function buildDrawerHandle(getNode: () => ISymbioteNode | null): IDrawerLayoutAndroidHandle {
  return {
    openDrawer: (): void => dispatchDrawerCommand(getNode(), OPEN_DRAWER_COMMAND),
    closeDrawer: (): void => dispatchDrawerCommand(getNode(), CLOSE_DRAWER_COMMAND),
  };
}
