// The framework-agnostic half of what @react-navigation exposes as `navigation.addListener` /
// `useFocusEffect` / `useIsFocused` / `useNavigationState`: a plain pub/sub emitter, zero React.
// addListener is NOT React-specific there either — React's hooks are thin useEffect wrappers
// around exactly this subscribe/unsubscribe shape (confirmed against the 8.x docs: `const
// unsubscribe = navigation.addListener('focus', cb); return unsubscribe;` inside a bare
// `useEffect`). One emitter per route (created by the adapter, e.g. stack.ts's per-route
// `emitters` map) carries that route's own focus/blur/state lifecycle; every adapter's lifecycle
// hooks subscribe to it, matching this file's single responsibility split from `constants.ts`
// (which only names Fabric view/prop-key strings, not this JS-only event system).
//
// diffFocusedRoute below centralizes the "which route lost focus, which gained it" comparison
// that tabs.ts and drawer.ts independently reimplemented in all three adapters (each watching its
// own router state for the focused index/key changing, then manually emitting BLUR to the old key
// and FOCUS to the new one, plus an initial FOCUS seed on first mount) — the diff is pure and
// identical everywhere; only WHEN to run it differs per framework (a `useEffect` dependency array,
// a Vue `watch`, an idempotent-per-read Angular method), so that half stays adapter-owned.

import { dlog } from '@symbiote-native/engine';

export const NAVIGATION_EVENT_FOCUS = 'focus';
export const NAVIGATION_EVENT_BLUR = 'blur';
export const NAVIGATION_EVENT_STATE = 'state';
export const NAVIGATION_EVENT_BEFORE_REMOVE = 'beforeRemove';

export type INavigationEventName =
  | typeof NAVIGATION_EVENT_FOCUS
  | typeof NAVIGATION_EVENT_BLUR
  | typeof NAVIGATION_EVENT_STATE
  | typeof NAVIGATION_EVENT_BEFORE_REMOVE;

export type INavigationEventListener<TData = unknown> = (data: TData) => void;

export type INavigationEmitter = {
  emit: (event: INavigationEventName, data?: unknown) => void;
  addListener: (event: INavigationEventName, listener: INavigationEventListener) => () => void;
};

export function createNavigationEmitter(): INavigationEmitter {
  const listenersByEvent = new Map<INavigationEventName, Set<INavigationEventListener>>();

  function addListener(
    event: INavigationEventName,
    listener: INavigationEventListener,
  ): () => void {
    let listeners = listenersByEvent.get(event);
    if (!listeners) {
      listeners = new Set();
      listenersByEvent.set(event, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners?.delete(listener);
    };
  }

  function emit(event: INavigationEventName, data?: unknown): void {
    const listeners = listenersByEvent.get(event);
    // Investigation instrumentation (flicker-on-focus bug): every emission, whether or not a
    // listener is attached, so the log stream shows if focus/blur ever fires with 0 subscribers
    // (a silent no-op) vs racing an actual effect. Kept behind DEBUG, never removed.
    dlog(
      `Navigation emitter: emit "${event}" (${listeners?.size ?? 0} listener(s)) at t=${Date.now()}`,
    );
    if (!listeners) return;
    for (const listener of listeners) listener(data);
  }

  return { emit, addListener };
}

// The keys, if any, that should be blurred/focused when the focused route's key changes from
// `prevKey` to `nextKey` — a pure comparison, no emitter, no timing. Covers all three shapes every
// adapter's lifecycle trigger needs: first mount (`prevKey` undefined -> `focusKey` only, no
// blur), unmount/no-longer-focused (`nextKey` undefined -> `blurKey` only), an ordinary focus
// change (both), and a no-op re-run with the same key (neither field set, e.g. a setParams-only
// change that leaves the focused key untouched). The caller looks up (or lazily creates) each
// key's own emitter and calls `.emit(NAVIGATION_EVENT_BLUR)` / `.emit(NAVIGATION_EVENT_FOCUS)` —
// this function only decides WHICH keys, never WHEN or on WHICH emitter.
export type IFocusTransition = {
  blurKey?: string;
  focusKey?: string;
};

export function diffFocusedRoute(
  prevKey: string | undefined,
  nextKey: string | undefined,
): IFocusTransition {
  if (prevKey === nextKey) return {};
  const transition: IFocusTransition = {};
  if (prevKey !== undefined) transition.blurKey = prevKey;
  if (nextKey !== undefined) transition.focusKey = nextKey;
  return transition;
}
