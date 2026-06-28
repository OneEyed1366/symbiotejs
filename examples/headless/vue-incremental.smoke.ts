// Vue path proof: the Vue renderer drives the SAME incremental clone-on-write engine as
// React, and anchor nodes (v-if/fragment placeholders) create ZERO native views. Drives
// the @symbiote/vue renderer against a counting fake slot and asserts:
//   1. first mount creates every real node once, and the v-if anchor adds NO native node,
//   2. a reactive text change re-clones only that branch (nothing is rebuilt),
//   3. flipping a v-if from false->true creates exactly one native node (the revealed view).

import { defineComponent, h, ref } from '@vue/runtime-core'
import { mount } from '../../adapters/vue/src/index'
import { View, Text } from '../../adapters/vue/src/components'

interface IFakeNode {
  id: number
  kind: string
  props: Record<string, unknown>
  children: IFakeNode[]
}

let counters = { createNode: 0, cloneProps: 0, cloneChildren: 0, completeRoot: 0 }
let nextId = 1

function fnode(kind: string, props: Record<string, unknown>, children: IFakeNode[]): IFakeNode {
  return { id: nextId++, kind, props, children }
}

const slot = {
  createNode(_tag: number, viewName: string, _rootTag: number, props: Record<string, unknown>): IFakeNode {
    counters.createNode += 1
    return fnode(viewName, props, [])
  },
  cloneNodeWithNewProps(n: IFakeNode, newProps: Record<string, unknown>): IFakeNode {
    counters.cloneProps += 1
    return fnode(n.kind, newProps, n.children)
  },
  cloneNodeWithNewChildren(n: IFakeNode): IFakeNode {
    counters.cloneChildren += 1
    return fnode(n.kind, n.props, [])
  },
  cloneNodeWithNewChildrenAndProps(n: IFakeNode, newProps: Record<string, unknown>): IFakeNode {
    counters.cloneChildren += 1
    return fnode(n.kind, newProps, [])
  },
  createChildSet: (): IFakeNode[] => [],
  appendChild(parent: IFakeNode, child: IFakeNode): IFakeNode {
    parent.children.push(child)
    return parent
  },
  appendChildToSet(set: IFakeNode[], child: IFakeNode): void {
    set.push(child)
  },
  completeRoot(): void {
    counters.completeRoot += 1
  },
  registerEventHandler(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

let failures = 0
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

function reset(): void {
  counters = { createNode: 0, cloneProps: 0, cloneChildren: 0, completeRoot: 0 }
}

// Drain microtasks (Vue's scheduler + the engine's requestCommit both coalesce on a
// microtask) plus one macrotask tick, so a mutation has fully committed before we assert.
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

let bump = (): void => {}
let toggle = (): void => {}

const App = defineComponent({
  setup() {
    const taps = ref(0)
    const show = ref(false)
    bump = (): void => {
      taps.value += 1
    }
    toggle = (): void => {
      show.value = !show.value
    }
    // The `: null` branch mounts a comment -> our anchor node when `show` is false.
    return () =>
      h(View, null, () => [
        h(Text, null, () => `Taps: ${taps.value}`),
        show.value ? h(View, { testID: 'extra' }) : null,
      ])
  },
})

const ROOT_TAG = 21

// ---- mount (show=false: the v-if branch is an anchor) ----------------------
reset()
mount(ROOT_TAG, App)
await tick()

// synthetic flex root + View + Text + raw-text = 4 createNode. The anchor for the false
// v-if creates ZERO. That is the whole point of skipping anchors at commit.
check('mount creates exactly the real nodes (4, anchor excluded)', counters.createNode === 4)
check('mount commits once', counters.completeRoot === 1)

// ---- reactive text change: re-clone only that branch -----------------------
reset()
bump()
await tick()

check('text change rebuilds nothing (0 createNode)', counters.createNode === 0)
check('text change re-clones (props/children)', counters.cloneProps + counters.cloneChildren >= 1)
check('text change commits once', counters.completeRoot === 1)

// ---- flip v-if false->true: the revealed view is the only new native node --
reset()
toggle()
await tick()

check('revealing a v-if creates exactly one native node', counters.createNode === 1)
check('reveal commits once', counters.completeRoot === 1)

console.log(failures === 0 ? '\nvue-incremental.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
