// Animated.event: bridge a real native event (a scroll's contentOffset, a pan's
// translation) into the value graph. An argMapping like
// `[{nativeEvent: {contentOffset: {y: scrollY}}}]` names, at its leaf positions,
// the AnimatedValues to drive; the path to each leaf is the key path inside the
// event object. Ported from RN's AnimatedEvent.js (JS + native paths), with the
// native-driver branches kept and AnimatedValueXY deferred.
//
// Two ways the mapping is consumed:
//   - JS path: __getHandler() returns a callback the adapter wires as the view's
//     event prop. Each fired event is walked against the mapping; every leaf
//     AnimatedValue is set from the matching event field, then flushed so its
//     bound props re-paint. config.listener is invoked passthrough.
//   - Native path: __attach(viewTag, eventName) mirrors each leaf value into native
//     and registers the key path with the stock native module, so the event drives
//     the view with zero JS per event.

import { dlog } from '../debug';
import { getNativeTag, whenCommitted } from '../commit';
import { isSymbioteNode, type ISymbioteNode } from '../node';
import { AnimatedNode, flushValue } from './graph';
import { isNativeAnimatedAvailable, nativeAnimated } from './native/native-animated';
import { isRecord } from '../type-guards';

// A leaf in the mapping is an AnimatedNode; every interior position is a nested
// record of further mappings. We never name AnimatedValueXY here (deferred).
type IMapping = AnimatedNode | { readonly [key: string]: IMapping };

export interface IEventConfig {
  readonly listener?: (...args: unknown[]) => void;
  // RN parity: real apps pass `useNativeDriver` on Animated.event (RN effectively
  // requires it). Accepted for source-compatibility but NOT consumed here; event()
  // always returns the JS handler, so the mapped value is driven per-event on the JS
  // thread. True UI-thread scroll driving does exist, but via the separate imperative
  // attachNativeEvent path (ScrollView wires it internally), never through this flag.
  // Unlike animation configs (animations/base.ts), where useNativeDriver IS honored,
  // here it is currently inert.
  readonly useNativeDriver?: boolean;
}

// One resolved leaf: the AnimatedValue at `path` inside the event's `nativeEvent`.
interface IMappedValue {
  readonly path: readonly string[];
  readonly node: AnimatedNode;
}

// A value node settable from an event field. AnimatedValue carries setValue; we
// duck-type it (rather than importing AnimatedValue) to keep this leaf-agnostic
// and avoid a value<->event import cycle.
function settableValue(node: AnimatedNode): ((value: number) => void) | undefined {
  const candidate = Reflect.get(node, 'setValue');
  return typeof candidate === 'function' ? value => candidate.call(node, value) : undefined;
}

// Walk the mapping to every leaf AnimatedNode, recording its key path. Shared by
// the JS handler (to set values) and the native attach (to register paths).
function collectMappedValues(
  mapping: IMapping,
  path: readonly string[],
  out: IMappedValue[],
): void {
  if (mapping instanceof AnimatedNode) {
    out.push({ path, node: mapping });
    return;
  }
  for (const key of Object.keys(mapping)) {
    const child = Reflect.get(mapping, key);
    if (child instanceof AnimatedNode) {
      out.push({ path: [...path, key], node: child });
    } else if (isRecord(child)) {
      collectMappedValues(child, [...path, key], out);
    }
  }
}

// Pull the numeric field at `path` out of one event argument. Returns undefined
// when the path is absent or the leaf is not a number, so a malformed event is a
// no-op rather than a throw inside an event dispatch.
function extractAtPath(event: unknown, path: readonly string[]): number | undefined {
  let current: unknown = event;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = Reflect.get(current, key);
  }
  return typeof current === 'number' ? current : undefined;
}

// The callback shape adapters wire as the view's event prop, carrying the
// AnimatedEvent so the native attach path is reachable from the handler alone.
export interface IAnimatedEventHandler {
  (...args: unknown[]): void;
  __getEvent(): AnimatedEvent;
}

export type IEventListener = (...args: unknown[]) => void;

export class AnimatedEvent {
  // Listeners fired (in registration order) after the values are driven. Seeded
  // with config.listener; forkEvent appends more via __addListener (RN
  // AnimatedEvent.js seeds `__addListener(config.listener)` in its constructor).
  private readonly listeners: IEventListener[] = [];
  // The leaves under argMapping[0].nativeEvent, the only place native-driven
  // events accept animated values (RN invariant). Resolved once at construction.
  private readonly mappedValues: readonly IMappedValue[];
  // RN parity: the event remembers whether useNativeDriver was requested. Honored only
  // when a native module is present (__isNative); otherwise the JS path drives values.
  private readonly nativeDriverRequested: boolean;
  // Flipped once a host view native-attaches this event: the JS handler then stops
  // setting values (native owns them on the UI thread) and only forwards listeners,
  // avoiding a double drive and a redundant per-tick commit.
  private attachedNatively = false;

  constructor(argMapping: readonly IMapping[], config?: IEventConfig) {
    if (config?.listener !== undefined) this.listeners.push(config.listener);
    this.nativeDriverRequested = config?.useNativeDriver === true;
    const mapped: IMappedValue[] = [];
    const first = argMapping[0];
    if (isRecord(first)) {
      const nativeEvent = Reflect.get(first, 'nativeEvent');
      if (isRecord(nativeEvent)) {
        collectMappedValues(nativeEvent, [], mapped);
      }
    }
    this.mappedValues = mapped;
  }

  // Append / drop a listener (RN AnimatedEvent.js __addListener / __removeListener).
  // forkEvent/unforkEvent use these to combine extra handlers onto one AnimatedEvent.
  __addListener(callback: IEventListener): void {
    this.listeners.push(callback);
  }

  __removeListener(callback: IEventListener): void {
    const index = this.listeners.indexOf(callback);
    if (index !== -1) this.listeners.splice(index, 1);
  }

  // Native path: mirror each leaf value into native and register its key path with
  // the stock module, so the event drives the view with zero JS per event.
  // Whether this event should drive its values natively: useNativeDriver requested AND
  // a native module present. The adapter consults it before native-attaching to a view.
  __isNative(): boolean {
    return this.nativeDriverRequested && isNativeAnimatedAvailable();
  }

  __attach(viewTag: number, eventName: string): void {
    for (const mapped of this.mappedValues) {
      mapped.node.__makeNative();
      dlog(`event: attach ${eventName} path=${mapped.path.join('.')} -> view=${viewTag}`);
      nativeAnimated.addAnimatedEventToView(viewTag, eventName, {
        nativeEventPath: mapped.path,
        animatedValueTag: mapped.node.__getNativeTag(),
      });
    }
    this.attachedNatively = true;
  }

  __detach(viewTag: number, eventName: string): void {
    for (const mapped of this.mappedValues) {
      dlog(`event: detach ${eventName} -> view=${viewTag}`);
      nativeAnimated.removeAnimatedEventFromView(viewTag, eventName, mapped.node.__getNativeTag());
    }
    this.attachedNatively = false;
  }

  // JS path: walk each leaf, set its value from the matching event field, flush so
  // its bound props re-paint, then forward the raw args to the user's listener.
  __getHandler(): IAnimatedEventHandler {
    const handler: IAnimatedEventHandler = Object.assign(
      (...args: unknown[]): void => {
        // Once natively attached, the UI thread owns the values, so skip the JS set/flush
        // (it would double-drive and commit per tick); only forward listeners below.
        if (!this.attachedNatively) {
          // Paths are stored relative to `nativeEvent` (the native module excludes
          // that prefix); the JS event arg still carries it, so re-add it here.
          const nativeEvent = isRecord(args[0]) ? Reflect.get(args[0], 'nativeEvent') : undefined;
          for (const mapped of this.mappedValues) {
            const extracted = extractAtPath(nativeEvent, mapped.path);
            if (extracted === undefined) continue;
            const setValue = settableValue(mapped.node);
            if (setValue === undefined) continue;
            setValue(extracted);
            flushValue(mapped.node);
          }
        }
        for (const listener of this.listeners) listener(...args);
      },
      { __getEvent: (): AnimatedEvent => this },
    );
    return handler;
  }
}

// The Animated.event factory: returns the handler an adapter wires as the event
// prop. The handler also exposes the AnimatedEvent (__getEvent) for adapters that
// need the native attach path.
export function event(
  argMapping: readonly IMapping[],
  config?: IEventConfig,
): IAnimatedEventHandler {
  return new AnimatedEvent(argMapping, config).__getHandler();
}

export interface INativeEventAttachment {
  detach(): void;
}

// Imperatively bind a real native event on a host node to the mapping's animated values, so the
// event drives them on the UI thread with zero JS per event. RN's
// AnimatedImplementation.attachNativeEvent (ScrollView.js:1095 uses it for sticky headers). The
// ScrollView is NOT an animated component, so the event can't ride a prop; it is attached to the
// node's native tag directly. Returns a detach handle. Callers MUST gate on
// isNativeAnimatedAvailable(): with no native module __attach no-ops and the values never move,
// so a JS Animated.event path must remain the fallback.
export function attachNativeEvent(
  node: ISymbioteNode,
  eventName: string,
  argMapping: readonly IMapping[],
): INativeEventAttachment {
  const animatedEvent = new AnimatedEvent(argMapping);
  let attachedTag: number | undefined;

  // Bind once the node is committed: now if it already has a Fabric tag, else after the commit that
  // assigns it. Vue/Svelte batch commits on a microtask, so the adapter can wire this (e.g. the
  // sticky-header scroll) before the tag exists; whenCommitted defers instead of silently binding
  // nothing. React commits synchronously and binds on the first try.
  const cancel = whenCommitted(node, () => {
    const viewTag = getNativeTag(node);
    if (viewTag === undefined) return;
    dlog(`attachNativeEvent: ${eventName} -> view=${viewTag}`);
    animatedEvent.__attach(viewTag, eventName);
    attachedTag = viewTag;
  });

  return {
    detach(): void {
      cancel();
      if (attachedTag !== undefined) animatedEvent.__detach(attachedTag, eventName);
    },
  };
}

// Native-attach the AnimatedEvent already behind a handler from `event(...)`, binding it
// to a committed host node. Unlike attachNativeEvent (which builds a fresh event from a
// raw mapping for ScrollView's internal sticky value), this REUSES the caller's handler,
// so createAnimatedComponent can offload `onScroll={Animated.event(..., {useNativeDriver})}`
// to the UI thread, and the __makeNative cascade carries the bound interpolations/props
// native with it. Returns undefined (caller keeps the JS path) when the prop is not a native
// event handler; if it IS but the node has no tag yet, the bind defers to the commit (same race).
export function attachNativeEventHandler(
  node: unknown,
  eventName: string,
  handler: unknown,
): INativeEventAttachment | undefined {
  if (!isSymbioteNode(node) || typeof handler !== 'function') return undefined;
  const accessor = Reflect.get(handler, '__getEvent');
  if (typeof accessor !== 'function') return undefined;
  const animatedEvent: unknown = accessor.call(handler);
  if (!(animatedEvent instanceof AnimatedEvent) || !animatedEvent.__isNative()) return undefined;
  const event = animatedEvent;
  let attachedTag: number | undefined;

  const cancel = whenCommitted(node, () => {
    const viewTag = getNativeTag(node);
    if (viewTag === undefined) return;
    event.__attach(viewTag, eventName);
    attachedTag = viewTag;
  });

  return {
    detach: (): void => {
      cancel();
      if (attachedTag !== undefined) event.__detach(attachedTag, eventName);
    },
  };
}

// Combine an existing event handler with an extra listener (RN
// AnimatedImplementation.js forkEventImpl ~519). Three cases, by the existing event:
//   - absent          -> the listener becomes the handler
//   - an AnimatedEvent -> the listener is appended to it; the same event is returned
//   - a plain function -> a new function calling both
// The AnimatedEvent is recognised through its handler's __getEvent (the only public
// seam), so a handler built by `event(...)` forks into the underlying AnimatedEvent.
export function forkEvent(
  existing: IAnimatedEventHandler | IEventListener | undefined,
  listener: IEventListener,
): IAnimatedEventHandler | IEventListener {
  if (existing === undefined) return listener;
  const animatedEvent = getAnimatedEvent(existing);
  if (animatedEvent !== undefined) {
    animatedEvent.__addListener(listener);
    return existing;
  }
  return (...args: unknown[]): void => {
    existing(...args);
    listener(...args);
  };
}

// Undo a forkEvent that targeted an AnimatedEvent (RN unforkEventImpl ~531). A
// plain-function fork has no removable seam, so this is a no-op for that case,
// exactly as RN, which only removes from an AnimatedEvent.
export function unforkEvent(
  existing: IAnimatedEventHandler | IEventListener | undefined,
  listener: IEventListener,
): void {
  const animatedEvent = existing === undefined ? undefined : getAnimatedEvent(existing);
  animatedEvent?.__removeListener(listener);
}

// Reach the AnimatedEvent behind a handler. event(...) returns an AnimatedEventHandler
// carrying __getEvent; a bare listener does not, so this narrows the fork cases.
function getAnimatedEvent(
  candidate: IAnimatedEventHandler | IEventListener,
): AnimatedEvent | undefined {
  const accessor = Reflect.get(candidate, '__getEvent');
  return typeof accessor === 'function' ? accessor.call(candidate) : undefined;
}
