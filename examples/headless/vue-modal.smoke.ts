// Headless proof of the Vue Modal over a fake Fabric slot. RCTModalHostView is an ordinary host
// node in the same childSet (no second JS surface): visible commits ModalHostView > container
// RCTView > children; hidden commits no modal node. The style math, the visible gate, and the
// keep-alive reducer are shared verbatim from @symbiote/components; Vue supplies the reactive
// lifecycle. Run after the barrel is rebuilt: ./node_modules/.bin/tsx vue-modal.smoke.ts

import { defineComponent, h, ref } from '@vue/runtime-core'
import { Modal, Text, mount } from '../../adapters/vue/src/index'

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

let allCreated: IFakeNode[] = []
let committed: IFakeNode[] = []

const slot = {
  createNode(tag: number, viewName: string, _rootTag: number, props: Record<string, unknown>, instanceHandle: unknown): IFakeNode {
    const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNode: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [...node.children] }),
  cloneNodeWithNewProps: (node: IFakeNode, newProps: Record<string, unknown>): IFakeNode => ({ ...node, props: newProps }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (node: IFakeNode, newProps: Record<string, unknown>): IFakeNode => ({ ...node, props: newProps, children: [] }),
  createChildSet: (): IFakeNode[] => [],
  appendChild(parent: IFakeNode, child: IFakeNode): void {
    parent.children.push(child)
  },
  appendChildToSet(childSet: IFakeNode[], child: IFakeNode): void {
    childSet.push(child)
  },
  completeRoot(_rootTag: number, childSet: IFakeNode[]): void {
    committed = childSet
  },
  registerEventHandler(): void {},
  dispatchCommand(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

let failures = 0
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const modalNodes = (): IFakeNode[] => allCreated.filter((n) => n.viewName === 'ModalHostView')

// ---- case 1: visible modal commits host > container > children -----------

allCreated = []
mount(
  92,
  defineComponent({
    setup: () => () =>
      h(Modal, { visible: true, animationType: 'slide', testID: 'm' }, () => [h(Text, {}, () => 'sheet')]),
  }),
)
await tick()

{
  const modal = modalNodes()[0]
  check('A1 ModalHostView committed when visible', modal !== undefined)
  check('A2 animationType forwarded', modal?.props.animationType === 'slide')
  check('A3 presentationStyle defaults to fullScreen', modal?.props.presentationStyle === 'fullScreen')
  check('A4 testID rides the host', modal?.props.testID === 'm')

  const container = modal?.children[0]
  check('A5 single child is a container RCTView', modal?.children.length === 1 && container?.viewName === 'RCTView')
  check('A6 container is collapsable:false', container?.props.collapsable === false)
  const childNames = container?.children.map((c) => c.viewName) ?? []
  const textIndex = childNames.findIndex((name) => name === 'RCTText' || name === 'RCTParagraph')
  check('A7 slot children nest UNDER the container, not the host', textIndex !== -1)
}

// ---- case 2: a hidden modal commits no host node ------------------------

allCreated = []
mount(93, defineComponent({ setup: () => () => h(Modal, { visible: false }, () => [h(Text, {}, () => 'hidden')]) }))
await tick()
check('A8 hidden modal commits no ModalHostView', modalNodes().length === 0)

// ---- case 3: visible->hidden toggle eventually unmounts the modal --------

allCreated = []
const isOpen = ref(true)
mount(94, defineComponent({ setup: () => () => h(Modal, { visible: isOpen.value }, () => [h(Text, {}, () => 'toggle')]) }))
await tick()
check('A9 toggle starts with the modal committed', modalNodes().length >= 1)

isOpen.value = false
await tick()
await tick()
// After the keep-alive frame the modal node is gone from the committed tree (root has no ModalHostView).
const committedHasModal = (committed[0]?.children ?? []).some((c) => c.viewName === 'ModalHostView')
check('A10 after visible->false the modal is unmounted from the committed tree', !committedHasModal)

console.log(failures === 0 ? '\nvue-modal.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
