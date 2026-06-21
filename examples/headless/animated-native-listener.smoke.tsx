// Headless proof that a JS listener on a NATIVE-driven value still fires. While
// native owns the frames, the JS value never changes per-frame — so addListener on
// a native value must ask native to stream updates back (onAnimatedValueUpdate on
// the device bus) and route them to the JS listener. We inject a device-event
// source (exactly how a real app wires RN's DeviceEventEmitter), make a value
// native, add a listener, emit a native update, and assert the listener fires and
// the JS value syncs. Then removing the last listener must stop native streaming.

import { type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { setDeviceEventSource } from '@symbiote/shared'
import { Animated } from '../../packages/react/src/animated'

// ---- injected device-event source (the app's RN DeviceEventEmitter stand-in) ----

const deviceListeners = new Map<string, Set<(payload: unknown) => void>>()
setDeviceEventSource({
  addListener(eventType: string, listener: (payload: unknown) => void) {
    const set = deviceListeners.get(eventType) ?? new Set()
    deviceListeners.set(eventType, set)
    set.add(listener)
    return {
      remove: () => {
        set.delete(listener)
      },
    }
  },
})
function emitDevice(eventType: string, payload: unknown): void {
  deviceListeners.get(eventType)?.forEach((listener) => listener(payload))
}

// ---- fake NativeAnimatedTurboModule (records calls) ----------------------

interface NativeCall {
  method: string
  args: unknown[]
}
const nativeCalls: NativeCall[] = []

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args })
  }
}

const fakeNativeAnimated = {
  createAnimatedNode(tag: number, config: unknown): void {
    nativeCalls.push({ method: 'createAnimatedNode', args: [tag, config] })
  },
  connectAnimatedNodes: record('connectAnimatedNodes'),
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode: record('startAnimatingNode'),
  stopAnimation: record('stopAnimation'),
  setAnimatedNodeValue: record('setAnimatedNodeValue'),
  setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
  flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
  extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
  startListeningToAnimatedNodeValue: record('startListeningToAnimatedNodeValue'),
  stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
  getValue: record('getValue'),
  addAnimatedEventToView: record('addAnimatedEventToView'),
  removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
}
Object.assign(globalThis, {
  nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
})

// ---- fake Fabric slot ----------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    return { tag, viewName, props, children: [], instanceHandle }
  },
  cloneNodeWithNewProps: (node: FakeNode, newProps: Record<string, unknown>): FakeNode => ({
    ...node,
    props: newProps,
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => ({ ...node, props: newProps, children: [] }),
  createChildSet: (): FakeNode[] => [],
  appendChild(parent: FakeNode, child: FakeNode): FakeNode {
    parent.children.push(child)
    return parent
  },
  appendChildToSet(childSet: FakeNode[], child: FakeNode): void {
    childSet.push(child)
  },
  completeRoot(_rootTag: number, _childSet: FakeNode[]): void {},
  registerEventHandler(): void {},
}
Object.assign(globalThis, { nativeFabricUIManager: slot })

function callsOf(method: string): NativeCall[] {
  return nativeCalls.filter((call) => call.method === method)
}

// ---- mount an Animated.View bound to a value, then drive it natively -------

const opacity = new Animated.Value(0)

function App(): ReactElement {
  return <Animated.View style={{ opacity }} />
}

mount(41, <App />)

// useNativeDriver makes `opacity` native; capture the native tag it was created as.
Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }).start()

const valueCreate = callsOf('createAnimatedNode').find((call) => {
  const config = call.args[1]
  return typeof config === 'object' && config !== null && 'type' in config && config.type === 'value'
})
const valueTag = valueCreate?.args[0]
if (typeof valueTag !== 'number') {
  throw new Error(`native value node was not created, got ${String(valueTag)}`)
}

// ---- a JS listener on the native value asks native to stream updates -------

let received: number | undefined
const listenerId = opacity.addListener((state) => {
  received = state.value
})

const startedListening = callsOf('startListeningToAnimatedNodeValue').some((c) => c.args[0] === valueTag)
if (!startedListening) {
  throw new Error(`addListener on a native value must startListeningToAnimatedNodeValue(${valueTag})`)
}

// native reports a mid-flight value via the device bus -> the JS listener fires
emitDevice('onAnimatedValueUpdate', { tag: valueTag, value: 0.5 })
if (received !== 0.5) {
  throw new Error(`native value listener should receive 0.5, got ${String(received)}`)
}
if (opacity.__getValue() !== 0.5) {
  throw new Error(`JS value should sync to the native update 0.5, got ${opacity.__getValue()}`)
}

// ---- removing the last listener stops the native stream -------------------

opacity.removeListener(listenerId)
const stoppedListening = callsOf('stopListeningToAnimatedNodeValue').some((c) => c.args[0] === valueTag)
if (!stoppedListening) {
  throw new Error(`removing the last listener must stopListeningToAnimatedNodeValue(${valueTag})`)
}

received = undefined
emitDevice('onAnimatedValueUpdate', { tag: valueTag, value: 0.9 })
if (received !== undefined) {
  throw new Error('a removed listener must not fire on further native updates')
}

console.log('native value listener: received 0.5 then unsubscribed | tag', valueTag)
console.log('animated-native-listener.smoke OK')
