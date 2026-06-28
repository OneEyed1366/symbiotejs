// The public instance a host ref hands back, RN's ReactFabricHostComponent. The
// reconciler's getPublicInstance augments the retained node with the imperative API
// libraries reach through (reanimated, gesture-handler, react-navigation): measure /
// measureInWindow / measureLayout / setNativeProps / focus / blur. The methods are
// attached onto the node object itself (not its props, so they never reach Fabric);
// each resolves the node's CURRENT committed handle at call time through shared, so a
// clone-on-write commit between calls is transparent. findNodeHandle lives here too,
// it is the same "ref -> native tag" lookup.

import {
  measure as sharedMeasure,
  measureInWindow as sharedMeasureInWindow,
  measureLayout as sharedMeasureLayout,
  setNativeProps as sharedSetNativeProps,
  dispatchViewCommand,
  getNativeTag,
  isSymbioteNode,
  dlog,
  type ISymbioteNode,
  type IMeasureOnSuccess,
  type IMeasureInWindowOnSuccess,
  type IMeasureLayoutOnSuccess,
} from '@symbiote/engine';

const FOCUS_COMMAND = 'focus';
const BLUR_COMMAND = 'blur';

export interface IHostInstance extends ISymbioteNode {
  measure(callback: IMeasureOnSuccess): void;
  measureInWindow(callback: IMeasureInWindowOnSuccess): void;
  measureLayout(
    relativeToNativeNode: IHostInstance | number,
    onSuccess: IMeasureLayoutOnSuccess,
    onFail?: () => void,
  ): void;
  setNativeProps(nativeProps: Record<string, unknown>): void;
  focus(): void;
  blur(): void;
}

function isHostInstance(node: ISymbioteNode): node is IHostInstance {
  return typeof Reflect.get(node, 'measure') === 'function';
}

// Augment the retained node with the public-instance methods, once. The same node
// instance persists across commits, so attaching once is enough, every method reads
// the live handle through shared on each call.
export function toPublicInstance(node: ISymbioteNode): IHostInstance {
  if (isHostInstance(node)) return node;
  return Object.assign(node, {
    measure(callback: IMeasureOnSuccess): void {
      sharedMeasure(node, callback);
    },
    measureInWindow(callback: IMeasureInWindowOnSuccess): void {
      sharedMeasureInWindow(node, callback);
    },
    measureLayout(
      relativeToNativeNode: IHostInstance | number,
      onSuccess: IMeasureLayoutOnSuccess,
      onFail?: () => void,
    ): void {
      if (!isSymbioteNode(relativeToNativeNode)) {
        dlog('measureLayout: relative target must be a host ref');
        return;
      }
      sharedMeasureLayout(node, relativeToNativeNode, onSuccess, onFail);
    },
    setNativeProps(nativeProps: Record<string, unknown>): void {
      sharedSetNativeProps(node, nativeProps);
    },
    focus(): void {
      dispatchViewCommand(node, FOCUS_COMMAND, []);
    },
    blur(): void {
      dispatchViewCommand(node, BLUR_COMMAND, []);
    },
  });
}

// The committed native tag of a host ref (or a bare tag, idempotent). RN's
// findNodeHandle: a ref/instance resolves to its reactTag, a number passes through,
// null/undefined yields null. Undefined-until-committed surfaces as null.
export function findNodeHandle(
  componentOrHandle: IHostInstance | ISymbioteNode | number | null | undefined,
): number | null {
  if (componentOrHandle === null || componentOrHandle === undefined) return null;
  if (typeof componentOrHandle === 'number') return componentOrHandle;
  if (isSymbioteNode(componentOrHandle)) return getNativeTag(componentOrHandle) ?? null;
  return null;
}
