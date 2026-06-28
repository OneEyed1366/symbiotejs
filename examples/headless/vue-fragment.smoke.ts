// Regression: Vue mounts a Fragment (what v-for / v-if-lists compile to) with EMPTY text
// nodes as its start/end anchors: hostCreateText(''), not comments. Those land in a non-Text
// container (a View), where a raw text is invalid in Fabric. The renderer must map an empty
// createText to an anchor (skipped at commit), or the mount throws
//   Text string "" must be rendered inside a <Text>
// This drives a keyed Fragment list and asserts mount/add/remove never create a native node
// for the empty-text anchors and never throw. Before the createText('') -> anchor fix, the
// very first mount threw.

import { defineComponent, h, ref, Fragment } from '@vue/runtime-core'
import { mount } from '../../adapters/vue/src/index'
import { View, Text } from '../../adapters/vue/src/components'

interface IFakeNode {
  id: number
  kind: string
  props: Record<string, unknown>
  children: IFakeNode[]
}

let counters = { createNode: 0, completeRoot: 0 }
let nextId = 1

function fnode(kind: string, props: Record<string, unknown>, children: IFakeNode[]): IFakeNode {
  return { id: nextId++, kind, props, children }
}

const slot = {
  createNode(_tag: number, viewName: string, _rootTag: number, props: Record<string, unknown>): IFakeNode {
    counters.createNode += 1
    return fnode(viewName, props, [])
  },
  cloneNodeWithNewProps: (n: IFakeNode, p: Record<string, unknown>): IFakeNode => fnode(n.kind, p, n.children),
  cloneNodeWithNewChildren: (n: IFakeNode): IFakeNode => fnode(n.kind, n.props, []),
  cloneNodeWithNewChildrenAndProps: (n: IFakeNode, p: Record<string, unknown>): IFakeNode => fnode(n.kind, p, []),
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
  counters = { createNode: 0, completeRoot: 0 }
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

interface IRow {
  id: number
  label: string
}

let addRow = (): void => {}
let dropRow = (): void => {}

const App = defineComponent({
  setup() {
    const rows = ref<IRow[]>([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ])
    let seq = 3
    addRow = (): void => {
      rows.value.push({ id: seq, label: `row-${seq}` })
      seq += 1
    }
    dropRow = (): void => {
      rows.value.pop()
    }
    // An explicit Fragment is exactly what `v-for` compiles to. Vue brackets it with
    // empty-text anchors, the case that used to throw on insert into the View.
    return () =>
      h(View, null, () => [
        h(
          Fragment,
          null,
          rows.value.map((row) => h(Text, { key: row.id }, () => row.label)),
        ),
      ])
  },
})

const ROOT_TAG = 31

// ---- mount with a 2-row fragment (this threw before the fix) ----------------
reset()
mount(ROOT_TAG, App)
await tick()

// flex root + View + 2x(Text + raw-text) = 6. The two empty-text fragment anchors create
// ZERO native nodes. That is the fix.
check('fragment mount does not throw and creates only real nodes (6)', counters.createNode === 6)
check('fragment mount commits once', counters.completeRoot === 1)

// ---- append a keyed row: one new Text + its raw-text -----------------------
reset()
addRow()
await tick()

check('appending a row creates exactly the new Text + raw-text (2)', counters.createNode === 2)
check('append commits once', counters.completeRoot === 1)

// ---- remove a row: keyed remove, no new native nodes -----------------------
reset()
dropRow()
await tick()

check('removing a row creates no native node', counters.createNode === 0)
check('remove commits once', counters.completeRoot === 1)

console.log(failures === 0 ? '\nvue-fragment.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
