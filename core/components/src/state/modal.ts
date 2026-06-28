// Modal: the logic half (framework-agnostic). RN keeps the modal mounted through its exit
// animation (Modal.js _shouldShowModal: visible===true || state.isRendered===true) so the
// native onDismiss event can arrive before the node unmounts. `isRendered` is PURELY that
// keep-alive; it never itself fires onDismiss (on Fabric onDismiss is a real native
// DirectEvent delivered via the host's onDismiss prop). The reducer mirrors RN's guarded
// transitions: arm the keep-alive on show, drop it on hide. The adapter drives the transition
// AFTER its render (React useEffect / Vue post-flush watch) so one keep-alive frame survives.

export type IModalState = {
  isRendered: boolean;
};

// On first render the keep-alive matches `visible`: a modal that starts visible is rendered,
// one that starts hidden contributes no node (the render gate returns null).
export function createInitialModalState(isVisible: boolean): IModalState {
  return { isRendered: isVisible };
}

export type IModalAction =
  // visible became true: re-arm the keep-alive (Modal.js componentDidUpdate).
  | { type: 'show' }
  // visible became false: drop the keep-alive so the node can unmount after the exit
  // transition. onDismiss is NOT fired here; the native topDismiss event is its single source.
  | { type: 'hide' };

// Identity-stable when nothing changes (returns the same object) so the adapter's effect/watch
// triggers no spurious re-render, matching React's guarded setState in Modal.js's effect.
export function modalReducer(state: IModalState, action: IModalAction): IModalState {
  switch (action.type) {
    case 'show':
      return state.isRendered ? state : { isRendered: true };
    case 'hide':
      return state.isRendered ? { isRendered: false } : state;
  }
}

// The visible gate with the keep-alive: a fully hidden modal (not visible AND no longer
// rendered) contributes no node, exactly as RN's render returns null when _shouldShowModal()
// is false.
export function shouldRenderModal(isVisible: boolean, state: IModalState): boolean {
  return isVisible || state.isRendered;
}
