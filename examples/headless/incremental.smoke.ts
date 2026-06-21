// Proof that the commit engine is INCREMENTAL, not a full rebuild. Drives the
// shared mutation API directly against a counting fake slot and asserts that:
//   1. a commit that changes one sibling re-clones only that sibling,
//   2. the untouched sibling's native handle is reused by reference (its native
//      view state would survive — the whole point of clone-on-write),
//   3. no createNode happens after first mount (nothing is rebuilt),
//   4. a commit with no changes makes zero native calls (no redundant completeRoot).

import {
  createElement,
  setProp,
  appendChild,
  createSurface,
} from '../../packages/shared/src/index'

interface FakeNode {
  id: number
  kind: string
  props: Record<string, unknown>
  children: FakeNode[]
}

let counters = { createNode: 0, cloneProps: 0, cloneChildren: 0, completeRoot: 0 }
let nextId = 1
let committed: FakeNode[] = []

function node(kind: string, props: Record<string, unknown>, children: FakeNode[]): FakeNode {
  return { id: nextId++, kind, props, children }
}

const slot = {
  createNode(
    _tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
  ): FakeNode {
    counters.createNode += 1
    return node(viewName, props, [])
  },
  cloneNodeWithNewProps(n: FakeNode, newProps: Record<string, unknown>): FakeNode {
    counters.cloneProps += 1
    return node(n.kind, newProps, n.children)
  },
  cloneNodeWithNewChildren(n: FakeNode): FakeNode {
    counters.cloneChildren += 1
    return node(n.kind, n.props, [])
  },
  cloneNodeWithNewChildrenAndProps(n: FakeNode, newProps: Record<string, unknown>): FakeNode {
    counters.cloneChildren += 1
    return node(n.kind, newProps, [])
  },
  createChildSet: (): FakeNode[] => [],
  appendChild(parent: FakeNode, child: FakeNode): FakeNode {
    parent.children.push(child)
    return parent
  },
  appendChildToSet(set: FakeNode[], child: FakeNode): void {
    set.push(child)
  },
  completeRoot(_rootTag: number, set: FakeNode[]): void {
    counters.completeRoot += 1
    committed = set
  },
  registerEventHandler(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

let failures = 0
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

// ---- build root > [A, B], A and B each wrap a child ----------------------

const ROOT_TAG = 11
const surface = createSurface(ROOT_TAG)

const a = createElement('RCTView')
setProp(a, 'opacity', 1)
appendChild(a, createElement('RCTView'))

const b = createElement('RCTView')
setProp(b, 'opacity', 1)
appendChild(b, createElement('RCTView'))

surface.appendChild(a)
surface.appendChild(b)

surface.commit()
// synthetic AppContainer root + A, A.child, B, B.child -> 5 createNode; one completeRoot.
check('mount creates every node once (5)', counters.createNode === 5)
check('mount commits once', counters.completeRoot === 1)
// committed[0] is the synthetic root; A and B are its two children.
const root = committed[0]
const aHandle1 = root.children[0]
const bHandle1 = root.children[1]

// ---- change only A's prop ------------------------------------------------

counters = { createNode: 0, cloneProps: 0, cloneChildren: 0, completeRoot: 0 }
setProp(a, 'opacity', 0.5)
surface.commit()

check('update rebuilds nothing (0 createNode)', counters.createNode === 0)
check('update re-clones A (props changed)', counters.cloneProps >= 1)
check('update commits once', counters.completeRoot === 1)
check('untouched sibling B is reused by reference', committed[0].children[1] === bHandle1)
check('changed sibling A gets a new handle', committed[0].children[0] !== aHandle1)
// One cloneChildren: the synthetic root re-clones to point at A's new handle. B's
// subtree is never cloned (proven by B's reuse above), so the count stays at exactly 1.
check('only the changed branch was cloned', counters.cloneChildren === 1)

// ---- a no-op commit must touch nothing native ----------------------------

counters = { createNode: 0, cloneProps: 0, cloneChildren: 0, completeRoot: 0 }
surface.commit()
check('no-op commit makes zero native calls', counters.completeRoot === 0 && counters.createNode === 0)

console.log(failures === 0 ? '\nincremental.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
