// Headless proof of the React Animated component bridge (Phase 2). A fake Fabric
// slot, no simulator: mount <Animated.View style={{ opacity }}> via @symbiote/react's
// mount, then drive the value by hand with setValue and assert the new opacity
// reached the committed view through a scoped commit. The per-frame path under test
// is value.setValue -> flushValue -> AnimatedProps.update() -> setNativeProps.
//
// NOTE: bare React setState does not flush synchronously headless, but setValue
// drives the value graph directly (synchronous flushValue -> setNativeProps), so the
// assertion lands without any event dispatch.

import { type ReactElement } from 'react'
import { mount } from '@symbiote/react'
// The Animated bridge source — reach it directly (no built dist in the harness).
import { Animated } from '../../packages/react/src/animated'

// ---- fake Fabric slot ----------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

let committed: FakeNode[] = []
let nextTag = 100

const slot = {
  createNode(
    _tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    return { tag: nextTag++, viewName, props, children: [], instanceHandle }
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
  completeRoot(_rootTag: number, childSet: FakeNode[]): void {
    committed = childSet
  },
  registerEventHandler(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// The app view sits under the synthetic box-none AppContainer root.
function appView(): FakeNode {
  if (committed.length !== 1 || committed[0].props.pointerEvents !== 'box-none') {
    throw new Error(`expected one synthetic box-none root, got ${JSON.stringify(committed)}`)
  }
  return committed[0].children[0]
}

// ---- direct-value path: setValue drives an animated style key ------------

const opacity = new Animated.Value(1)

function App(): ReactElement {
  return <Animated.View style={{ opacity }} />
}

const ROOT_TAG = 41
mount(ROOT_TAG, <App />)

if (appView().viewName !== 'RCTView') {
  throw new Error(`expected the animated view under the root, got ${appView().viewName}`)
}
// Initial render reduces the animated value to its current (1).
if (appView().props.opacity !== 1) {
  throw new Error(`initial opacity should be 1, got ${JSON.stringify(appView().props)}`)
}

opacity.setValue(0.3)
if (appView().props.opacity !== 0.3) {
  throw new Error(`setValue(0.3) should reach the view, got ${JSON.stringify(appView().props)}`)
}

// ---- interpolation path: an interpolated value maps through the leaf -----

const progress = new Animated.Value(0)
const faded = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })

function FadeApp(): ReactElement {
  return <Animated.View style={{ opacity: faded }} />
}

mount(ROOT_TAG, <FadeApp />)

if (appView().props.opacity !== 0) {
  throw new Error(`interpolated initial opacity should be 0, got ${JSON.stringify(appView().props)}`)
}

progress.setValue(0.5)
if (appView().props.opacity !== 0.5) {
  throw new Error(`interpolated setValue(0.5) should map to 0.5, got ${JSON.stringify(appView().props)}`)
}

console.log('after setValue: opacity =', appView().props.opacity)
console.log('animated-component.smoke OK')
