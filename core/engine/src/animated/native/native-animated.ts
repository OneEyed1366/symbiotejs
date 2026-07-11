// The native-driver bridge. When an animation runs with
// useNativeDriver:true, the whole value graph is mirrored into native "animated
// nodes" and the curve is handed to the stock NativeAnimated TurboModule, which
// then mutates the bound shadow node every frame with ZERO JS per frame.
//
// We consume the module that ships in stock react-native, no native fork. On
// iOS bridgeless it registers as `NativeAnimatedTurboModule`; we fall back to the
// legacy `NativeAnimatedModule` name. Resolution goes through the same JSI seam as
// every other native module (getNativeModule). The
// module is resolved lazily on first use, so importing this file headless (no
// native host) is inert until a native-driven animation actually starts.

import { dlog } from '../../debug';
import { getNativeModule } from '../../native-modules';
import { NativeEventEmitter, type IEventSubscription } from '../../native-events';
import { isRecord } from '../../type-guards';

// Opaque per-platform tuning bag forwarded into a native node/animation config,
// mirroring RN's AnimatedPlatformConfig.js (`export type PlatformConfig = {}`).
// Stock RN keeps it empty today; it is the seam a future native driver reads
// platform-specific knobs from. Forwarded verbatim, never inspected here.
export type IPlatformConfig = Record<string, unknown>;

// An animated-node config (`{type:'value'|'interpolation'|'style'|'transform'|'props', …}`)
// and an animation config (`{type:'frames'|'spring'|'decay', …}`) cross into native as
// plain JSON. They are open by design: each node/driver fills its own shape.
export interface INativeNodeConfig {
  readonly type: string;
  readonly [key: string]: unknown;
}
export interface INativeAnimationConfig {
  readonly type: string;
  readonly [key: string]: unknown;
}
export interface INativeEventMapping {
  readonly nativeEventPath: readonly string[];
  readonly animatedValueTag: number;
}

export interface INativeEndResult {
  finished: boolean;
  value?: number;
  offset?: number;
}
export type INativeEndCallback = (result: INativeEndResult) => void;

// The TurboModule method surface we use (iOS, no Android single-op batching). The
// caller vouches for this shape via getNativeModule's generic: the single trust
// boundary, no per-call cast.
interface INativeAnimatedSpec {
  createAnimatedNode(tag: number, config: INativeNodeConfig): void;
  connectAnimatedNodes(parentTag: number, childTag: number): void;
  disconnectAnimatedNodes(parentTag: number, childTag: number): void;
  connectAnimatedNodeToView(nodeTag: number, viewTag: number): void;
  disconnectAnimatedNodeFromView(nodeTag: number, viewTag: number): void;
  restoreDefaultValues(nodeTag: number): void;
  dropAnimatedNode(tag: number): void;
  startAnimatingNode(
    animationId: number,
    nodeTag: number,
    config: INativeAnimationConfig,
    endCallback: INativeEndCallback,
  ): void;
  stopAnimation(animationId: number): void;
  setAnimatedNodeValue(nodeTag: number, value: number): void;
  setAnimatedNodeOffset(nodeTag: number, offset: number): void;
  flattenAnimatedNodeOffset(nodeTag: number): void;
  extractAnimatedNodeOffset(nodeTag: number): void;
  startListeningToAnimatedNodeValue(tag: number): void;
  stopListeningToAnimatedNodeValue(tag: number): void;
  getValue(tag: number, saveValueCallback: (value: number) => void): void;
  addAnimatedEventToView(
    viewTag: number,
    eventName: string,
    eventMapping: INativeEventMapping,
  ): void;
  removeAnimatedEventFromView(viewTag: number, eventName: string, animatedNodeTag: number): void;
}

// iOS bridgeless registers the Turbo variant; the legacy name is the fallback.
const TURBO_MODULE_NAME = 'NativeAnimatedTurboModule';
const LEGACY_MODULE_NAME = 'NativeAnimatedModule';

let resolved: INativeAnimatedSpec | null = null;

function module(): INativeAnimatedSpec | null {
  if (resolved !== null) return resolved;
  // Don't cache a miss: the native host may not be installed yet at first call
  // (or a headless smoke installs a fake afterwards).
  const found =
    getNativeModule<INativeAnimatedSpec>(TURBO_MODULE_NAME) ??
    getNativeModule<INativeAnimatedSpec>(LEGACY_MODULE_NAME);
  if (found !== null) resolved = found;
  return found;
}

// True when the stock native module is present in the binary: the gate the
// drivers consult before honouring useNativeDriver:true (else they fall back to
// the JS-driven path).
export function isNativeAnimatedAvailable(): boolean {
  return module() !== null;
}

let nextNodeTag = 1;
let nextAnimationId = 1;

export function generateNativeNodeTag(): number {
  return nextNodeTag++;
}
export function generateNativeAnimationId(): number {
  return nextAnimationId++;
}

// JS observation of a native-driven value. While native owns the frames, JS sees
// no per-frame change, so a JS listener on a native value asks native to stream
// updates back, which it emits as `onAnimatedValueUpdate` ({tag, value}) on the
// device event bus. One subscription fans those out to per-tag callbacks. The event
// NAME is the load-bearing contract with the stock native module (a wrong name is
// silent headless and dead on device).
const VALUE_UPDATE_EVENT = 'onAnimatedValueUpdate';
const valueListeners = new Map<number, (value: number) => void>();
let valueUpdateSubscription: IEventSubscription | undefined;

function ensureValueUpdateSubscription(): void {
  if (valueUpdateSubscription !== undefined) return;
  valueUpdateSubscription = new NativeEventEmitter().addListener(VALUE_UPDATE_EVENT, payload => {
    if (!isRecord(payload)) return;
    const tag = Reflect.get(payload, 'tag');
    const value = Reflect.get(payload, 'value');
    if (typeof tag === 'number' && typeof value === 'number') {
      valueListeners.get(tag)?.(value);
    }
  });
}

// Thin pass-throughs. Calls are issued synchronously in dependency order
// (createAnimatedNode before connect before start), so no operation queue is
// needed on iOS. RN's own non-single-op path calls straight through when its
// queue is empty. Each guards on availability so a missing module degrades to a
// logged no-op rather than a throw inside a commit.
export const nativeAnimated = {
  createAnimatedNode(tag: number, config: INativeNodeConfig): void {
    module()?.createAnimatedNode(tag, config);
  },
  connectAnimatedNodes(parentTag: number, childTag: number): void {
    module()?.connectAnimatedNodes(parentTag, childTag);
  },
  disconnectAnimatedNodes(parentTag: number, childTag: number): void {
    module()?.disconnectAnimatedNodes(parentTag, childTag);
  },
  connectAnimatedNodeToView(nodeTag: number, viewTag: number): void {
    dlog(`native: connect node=${nodeTag} -> view=${viewTag}`);
    module()?.connectAnimatedNodeToView(nodeTag, viewTag);
  },
  disconnectAnimatedNodeFromView(nodeTag: number, viewTag: number): void {
    module()?.disconnectAnimatedNodeFromView(nodeTag, viewTag);
  },
  restoreDefaultValues(nodeTag: number): void {
    dlog(`native: restoreDefaultValues node=${nodeTag}`);
    module()?.restoreDefaultValues(nodeTag);
  },
  dropAnimatedNode(tag: number): void {
    module()?.dropAnimatedNode(tag);
  },
  startAnimatingNode(
    animationId: number,
    nodeTag: number,
    config: INativeAnimationConfig,
    endCallback: INativeEndCallback,
  ): void {
    dlog(`native: startAnimatingNode id=${animationId} node=${nodeTag} type=${config.type}`);
    module()?.startAnimatingNode(animationId, nodeTag, config, endCallback);
  },
  stopAnimation(animationId: number): void {
    module()?.stopAnimation(animationId);
  },
  setAnimatedNodeValue(nodeTag: number, value: number): void {
    module()?.setAnimatedNodeValue(nodeTag, value);
  },
  setAnimatedNodeOffset(nodeTag: number, offset: number): void {
    module()?.setAnimatedNodeOffset(nodeTag, offset);
  },
  flattenAnimatedNodeOffset(nodeTag: number): void {
    module()?.flattenAnimatedNodeOffset(nodeTag);
  },
  extractAnimatedNodeOffset(nodeTag: number): void {
    module()?.extractAnimatedNodeOffset(nodeTag);
  },
  startListeningToAnimatedNodeValue(tag: number): void {
    module()?.startListeningToAnimatedNodeValue(tag);
  },
  stopListeningToAnimatedNodeValue(tag: number): void {
    module()?.stopListeningToAnimatedNodeValue(tag);
  },
  // High-level value observation: register a per-tag callback and ask native to
  // stream this node's updates. The last unsubscribe tears the shared device
  // subscription down too.
  startListeningToValue(tag: number, callback: (value: number) => void): void {
    ensureValueUpdateSubscription();
    valueListeners.set(tag, callback);
    dlog(`native: startListeningToValue node=${tag}`);
    module()?.startListeningToAnimatedNodeValue(tag);
  },
  stopListeningToValue(tag: number): void {
    valueListeners.delete(tag);
    module()?.stopListeningToAnimatedNodeValue(tag);
    if (valueListeners.size === 0 && valueUpdateSubscription !== undefined) {
      valueUpdateSubscription.remove();
      valueUpdateSubscription = undefined;
    }
  },
  addAnimatedEventToView(viewTag: number, eventName: string, mapping: INativeEventMapping): void {
    module()?.addAnimatedEventToView(viewTag, eventName, mapping);
  },
  removeAnimatedEventFromView(viewTag: number, eventName: string, animatedNodeTag: number): void {
    module()?.removeAnimatedEventFromView(viewTag, eventName, animatedNodeTag);
  },
};
