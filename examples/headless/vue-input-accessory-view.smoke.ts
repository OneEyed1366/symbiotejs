// Headless proof of the Vue InputAccessoryView over a fake Fabric slot. The host node assembly
// (nativeID / backgroundColor / style / accessibility forwarding) is shared verbatim from
// @symbiote/components/renderInputAccessoryView; Vue supplies only the functional bridge + slot
// children. Run after the barrel is rebuilt: ./node_modules/.bin/tsx vue-input-accessory-view.smoke.ts

import { defineComponent, h } from '@vue/runtime-core'
import { InputAccessoryView, Text, mount } from '../../adapters/vue/src/index'

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

let allCreated: IFakeNode[] = []

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
  completeRoot(): void {},
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

allCreated = []
mount(
  91,
  defineComponent({
    setup: () => () =>
      h(
        InputAccessoryView,
        { nativeID: 'kbd-bar', backgroundColor: '#eee', testID: 'iav', 'aria-label': 'toolbar' },
        () => [h(Text, {}, () => 'Done')],
      ),
  }),
)
await tick()

const host = allCreated.find((n) => n.viewName === 'RCTInputAccessoryView')
check('A1 RCTInputAccessoryView created', host !== undefined)
check('A2 nativeID forwarded', host?.props.nativeID === 'kbd-bar')
check('A3 backgroundColor forwarded', host?.props.backgroundColor === '#eee')
check('A4 testID forwarded', host?.props.testID === 'iav')
check('A5 aria-label folded to accessibilityLabel', host?.props.accessibilityLabel === 'toolbar')
check('A6 raw aria-label does NOT reach native', !('aria-label' in (host?.props ?? {})))
{
  const childNames = host?.children.map((c) => c.viewName) ?? []
  const textIndex = childNames.findIndex((name) => name === 'RCTText' || name === 'RCTParagraph')
  check('A7 slot child nests under the host', textIndex !== -1)
}

console.log(failures === 0 ? '\nvue-input-accessory-view.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
