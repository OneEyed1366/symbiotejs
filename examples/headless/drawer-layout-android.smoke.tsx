/** @jsxRuntime automatic */
// Headless proof of the DrawerLayoutAndroid primitive over the same fake Fabric slot
// as the other smokes. It asserts the load-bearing facts: on Android the component
// commits an AndroidDrawerLayout host node carrying drawerWidth/drawerPosition, with
// the content wrapper FIRST and the navigation wrapper SECOND (RN's
// {childrenWrapper}{drawerViewWrapper} order — getting this backwards swaps the
// drawer and the content); and the imperative openDrawer()/closeDrawer() reached
// through the ref dispatch the matching view command to that host node. No
// simulator — a failure here is in JS, not native.
//
// Per ADR 0019 the drawer is split by filename, not a Platform.OS branch: the real
// native build is drawer-layout-android.android.ts, and the base drawer-layout-android.ts
// is the off-Android fallback. So this imports each DIRECTLY — no Metro, no runtime
// Platform.OS toggle. The .android build is asserted to commit AndroidDrawerLayout and
// dispatch the drawer commands; the base build is asserted to degrade to a plain View.

import { type ReactElement } from 'react'
import { View, Text, mount } from '@symbiote/react'

import {
  DrawerLayoutAndroid,
  type DrawerLayoutAndroidHandle,
} from '../../packages/react/src/drawer-layout-android.android'
import { DrawerLayoutAndroid as DrawerLayoutFallback } from '../../packages/react/src/drawer-layout-android'

// ---- fake Fabric slot ---------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

interface DispatchedCommand {
  tag: number
  command: string
  args: ReadonlyArray<unknown>
}

let committed: FakeNode[] = []
const allCreated: FakeNode[] = []
const dispatched: DispatchedCommand[] = []

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    const node: FakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
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
  // dispatchViewCommand routes through here; capture the command for the ref assertion.
  dispatchCommand(node: FakeNode, command: string, args: ReadonlyArray<unknown>): void {
    dispatched.push({ tag: node.tag, command, args })
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- helpers ------------------------------------------------------------

function serialize(nodes: FakeNode[]): string {
  return nodes.map(serializeNode).join('')
}
function serializeNode(node: FakeNode): string {
  const kids = node.children.length ? `(${node.children.map(serializeNode).join('')})` : ''
  return `${node.viewName}${kids}`
}

function reset(): void {
  committed = []
  allCreated.length = 0
  dispatched.length = 0
}

function drawerNode(): FakeNode {
  const node = allCreated.find((n) => n.viewName === 'AndroidDrawerLayout')
  if (!node) throw new Error('no AndroidDrawerLayout was created')
  return node
}

// The shared commit hoists flattened style keys to the top level of node props
// (commit.ts fabricProps), so style assertions read node.props directly.
function styleOf(node: FakeNode): Record<string, unknown> {
  return node.props
}

// ---- case 1: a drawer commits AndroidDrawerLayout(content, navigation) ----
// The content wrapper nests FIRST under the host and the navigation wrapper SECOND,
// proving RN's {childrenWrapper}{drawerViewWrapper} order — one childSet, no separate
// rooting. Each wrapper is an RCTView holding its RCTView/RCTText subtree.

mount(40, (
  <DrawerLayoutAndroid
    drawerWidth={300}
    drawerPosition="left"
    renderNavigationView={() => (
      <View>
        <Text>Menu</Text>
      </View>
    )}
  >
    <View>
      <Text>Content</Text>
    </View>
  </DrawerLayoutAndroid>
))

const shape = serialize(committed[0]?.children ?? [])
const expectedShape =
  'AndroidDrawerLayout(RCTView(RCTView(RCTText(RCTRawText)))RCTView(RCTView(RCTText(RCTRawText))))'
if (shape !== expectedShape) {
  throw new Error(`drawer committed wrong tree: ${shape}`)
}

const host = drawerNode()
if (styleOf(host).drawerWidth !== 300) {
  throw new Error(`AndroidDrawerLayout missing drawerWidth:300, got ${JSON.stringify(host.props.drawerWidth)}`)
}
if (host.props.drawerPosition !== 'left') {
  throw new Error(`AndroidDrawerLayout missing drawerPosition:'left', got ${JSON.stringify(host.props.drawerPosition)}`)
}
if (host.children.length !== 2) {
  throw new Error(`AndroidDrawerLayout should hold exactly two wrappers, got ${host.children.length}`)
}
// content wrapper FIRST: it carries the absolute full-screen mainSubview style.
if (styleOf(host.children[0]).position !== 'absolute' || styleOf(host.children[0]).right !== 0) {
  throw new Error(`first child should be the content (mainSubview) wrapper, got ${JSON.stringify(host.children[0].props)}`)
}
// navigation wrapper SECOND: drawerWidth-wide, background from drawerBackgroundColor.
if (styleOf(host.children[1]).width !== 300) {
  throw new Error(`second child should be the navigation (drawerSubview) wrapper width:300, got ${JSON.stringify(host.children[1].props)}`)
}
if (styleOf(host.children[1]).backgroundColor !== 'white') {
  throw new Error(`navigation wrapper should default backgroundColor 'white', got ${JSON.stringify(host.children[1].props.backgroundColor)}`)
}

// ---- case 2: openDrawer() via the ref dispatches the openDrawer command ----
// The imperative handle resolves the committed host node and issues the command;
// the fake dispatchCommand captures it. closeDrawer() dispatches its own command.

reset()

// A callback ref captures the imperative handle React installs at commit, so the
// assertions below can call openDrawer()/closeDrawer() and read what the fake slot saw.
let handle: DrawerLayoutAndroidHandle | null = null

function ImperativeCase(): ReactElement {
  return (
    <DrawerLayoutAndroid
      ref={(instance) => { handle = instance }}
      drawerWidth={250}
      renderNavigationView={() => <View />}
    >
      <View />
    </DrawerLayoutAndroid>
  )
}

mount(41, <ImperativeCase />)

if (handle === null) {
  throw new Error('imperative handle was not captured after commit')
}

handle.openDrawer()
const openCmd = dispatched.find((d) => d.command === 'openDrawer')
if (!openCmd) {
  throw new Error(`openDrawer() did not dispatch the 'openDrawer' command, got ${JSON.stringify(dispatched)}`)
}
if (openCmd.tag !== drawerNode().tag) {
  throw new Error(`openDrawer dispatched to the wrong node tag ${openCmd.tag}, expected ${drawerNode().tag}`)
}

handle.closeDrawer()
if (!dispatched.some((d) => d.command === 'closeDrawer')) {
  throw new Error(`closeDrawer() did not dispatch the 'closeDrawer' command, got ${JSON.stringify(dispatched)}`)
}

// ---- case 3: the base build degrades to a plain View, commands are no-ops ----
// The off-Android fallback (base drawer-layout-android.ts) renders the content in a
// plain container — no AndroidDrawerLayout host node — and its imperative open/close
// dispatch nothing (there is no drawer to drive).

reset()

let fallbackHandle: DrawerLayoutAndroidHandle | null = null
function FallbackCase(): ReactElement {
  return (
    <DrawerLayoutFallback
      ref={(instance) => { fallbackHandle = instance }}
      drawerWidth={250}
      renderNavigationView={() => <View />}
    >
      <View>
        <Text>Content</Text>
      </View>
    </DrawerLayoutFallback>
  )
}

mount(42, <FallbackCase />)

if (allCreated.some((n) => n.viewName === 'AndroidDrawerLayout')) {
  throw new Error('the base fallback must NOT create an AndroidDrawerLayout host node')
}
if (fallbackHandle === null) {
  throw new Error('fallback imperative handle was not captured')
}
fallbackHandle.openDrawer()
fallbackHandle.closeDrawer()
if (dispatched.length !== 0) {
  throw new Error(`fallback open/close must be no-ops, got ${JSON.stringify(dispatched)}`)
}

console.log('drawer-layout-android.smoke OK')
