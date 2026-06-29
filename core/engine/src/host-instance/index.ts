// The public instance a host ref hands back, RN's ReactFabricHostComponent. toPublicInstance
// augments the retained node with the imperative API libraries reach through (reanimated,
// gesture-handler, react-navigation): measure / measureInWindow / measureLayout /
// setNativeProps / focus / blur. The methods are attached onto the node object itself (not its
// props, so they never reach Fabric); each resolves the node's CURRENT committed handle at call
// time through the engine, so a clone-on-write commit between calls is transparent.
//
// This lives in the engine, not an adapter: it depends only on engine internals (the commit
// free functions + the retained node), so every adapter inherits the SAME public instance for
// free — React's getPublicInstance and the Vue renderer both graft this onto their host nodes.

import {
  measure as engineMeasure,
  measureInWindow as engineMeasureInWindow,
  measureLayout as engineMeasureLayout,
  setNativeProps as engineSetNativeProps,
  dispatchViewCommand,
} from '../commit';
import { isSymbioteNode, type ISymbioteNode } from '../node';
import { dlog } from '../debug';
import type {
  IMeasureOnSuccess,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
} from '../fabric';

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
// the live handle through the engine on each call.
export function toPublicInstance(node: ISymbioteNode): IHostInstance {
  if (isHostInstance(node)) return node;
  return Object.assign(node, {
    measure(callback: IMeasureOnSuccess): void {
      engineMeasure(node, callback);
    },
    measureInWindow(callback: IMeasureInWindowOnSuccess): void {
      engineMeasureInWindow(node, callback);
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
      engineMeasureLayout(node, relativeToNativeNode, onSuccess, onFail);
    },
    setNativeProps(nativeProps: Record<string, unknown>): void {
      engineSetNativeProps(node, nativeProps);
    },
    focus(): void {
      dispatchViewCommand(node, FOCUS_COMMAND, []);
    },
    blur(): void {
      dispatchViewCommand(node, BLUR_COMMAND, []);
    },
  });
}
