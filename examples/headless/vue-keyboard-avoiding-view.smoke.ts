// Headless proof of the Vue KeyboardAvoidingView over the same fake Fabric slot the React
// keyboard-avoiding-view.smoke uses, so the shared @symbiote/components logic (computeInset +
// resolveKeyboardAvoidingLayout) is exercised through Vue's reactive lifecycle: an inset ref, an
// onMounted Keyboard subscription, and an onLayout-measured frame. It checks the measured frame
// feeds the inset, that a keyboardDidShow folds paddingBottom into the wrapper ('padding'
// behavior), that keyboardDidHide clears it, and that enabled=false passes the view through
// untouched. The React twin (keyboard-avoiding-view.smoke.tsx) proves the same contract through
// useState + useEffect. NOTE: authored to the existing vue-*.smoke shape; run once the engine
// barrel exports Keyboard / KEYBOARD_EVENT (added by the restructure).

import { defineComponent, h } from '@vue/runtime-core'
import { mount } from '../../adapters/vue/src/index'
import { KeyboardAvoidingView } from '../../adapters/vue/src/keyboard-avoiding-view'

// ---- fake Fabric slot (same shape as vue-switch.smoke.ts) ----------------

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

type IEventHandler = (instanceHandle: unknown, topLevelType: string, nativeEvent: Record<string, unknown>) => void

let eventHandler: IEventHandler | undefined
let allCreated: IFakeNode[] = []

const slot = {
  createNode(tag: number, viewName: string, _rootTag: number, props: Record<string, unknown>, instanceHandle: unknown): IFakeNode {
    const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNode: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [...node.children] }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, props: { ...node.props }, children: [] }),
  cloneNodeWithNewProps(node: IFakeNode, props: Record<string, unknown>): IFakeNode {
    const clone: IFakeNode = { ...node, props: { ...node.props, ...props }, children: [...node.children] }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewChildrenAndProps(node: IFakeNode, props: Record<string, unknown>): IFakeNode {
    const clone: IFakeNode = { ...node, props: { ...node.props, ...props }, children: [] }
    allCreated.push(clone)
    return clone
  },
  createChildSet: (): IFakeNode[] => [],
  appendChild(parent: IFakeNode, child: IFakeNode): void {
    parent.children.push(child)
  },
  appendChildToSet(childSet: IFakeNode[], child: IFakeNode): void {
    childSet.push(child)
  },
  completeRoot(): void {},
  registerEventHandler(handler: IEventHandler): void {
    eventHandler = handler
  },
  dispatchCommand(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- fake KeyboardObserver native module + device hub --------------------

const registeredModules: Record<string, unknown> = {
  KeyboardObserver: { addListener: (): void => {}, removeListeners: (): void => {} },
}
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined

Object.assign(globalThis, {
  __turboModuleProxy: <T>(name: string): T | null => {
    const module = registeredModules[name]
    return module === undefined || module === null ? null : isType<T>(module) ? module : null
  },
  RN$registerCallableModule: (
    name: string,
    factory: () => { emit: (eventType: string, ...args: unknown[]) => void },
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory()
  },
})

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined
}

// ---- helpers ------------------------------------------------------------

let failures = 0
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
function reset(): void {
  allCreated = []
}
function wrapperNode(): IFakeNode {
  // symbiote-view → RCTView; the KAV wrapper is the first RCTView that ISN'T the engine's synthetic
  // box-none root (same disambiguation the image-background smoke uses).
  const node = allCreated.find((n) => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none')
  if (!node) throw new Error('no wrapper RCTView was created')
  return node
}
function latest(tag: number): IFakeNode {
  const matches = allCreated.filter((n) => n.tag === tag)
  const node = matches[matches.length - 1]
  if (!node) throw new Error(`no node for tag ${tag}`)
  return node
}
function fireLayout(node: IFakeNode, layout: Record<string, number>): void {
  if (!eventHandler) throw new Error('no event handler registered')
  eventHandler(node.instanceHandle, 'topLayout', { layout })
}
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

// The engine flattens the style array and HOISTS its keys onto the committed node's props, so
// paddingBottom lands at props.paddingBottom (top-level), exactly as the React KAV smoke reads it.
function readPaddingBottom(node: IFakeNode): unknown {
  return node.props.paddingBottom
}

// ---- case 1: keyboardDidShow folds paddingBottom into the wrapper --------

reset()
mount(
  60,
  defineComponent({
    setup() {
      return () =>
        h(KeyboardAvoidingView, { behavior: 'padding', style: { flex: 1 } }, { default: () => [h('symbiote-text', {}, 'body')] })
    },
  }),
)
await tick()

{
  const wrapper = wrapperNode()
  // Measure the wrapper: top y=0, height=800.
  fireLayout(wrapper, { x: 0, y: 0, width: 400, height: 800 })
  if (deviceHub === undefined) throw new Error('Keyboard must install the device hub on first subscribe')
  // Keyboard shows: top edge at 500, height 300 → inset = 800 - 500 = 300.
  deviceHub.emit('keyboardDidShow', { duration: 250, easing: 'keyboard', endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 } })
  await tick()

  const shown = latest(wrapper.tag)
  check('keyboardDidShow folds paddingBottom 300 into the wrapper', readPaddingBottom(shown) === 300)

  // Keyboard hides → inset back to 0.
  deviceHub.emit('keyboardDidHide', {})
  await tick()
  const hidden = latest(wrapper.tag)
  check('keyboardDidHide clears the inset (paddingBottom 0)', readPaddingBottom(hidden) === 0)
}

// ---- case 2: enabled=false passes the view through untouched -------------

reset()
mount(
  61,
  defineComponent({
    setup() {
      return () =>
        h(
          KeyboardAvoidingView,
          { behavior: 'padding', enabled: false, style: { flex: 1 } },
          { default: () => [h('symbiote-text', {}, 'body')] },
        )
    },
  }),
)
await tick()

{
  const wrapper = wrapperNode()
  fireLayout(wrapper, { x: 0, y: 0, width: 400, height: 800 })
  deviceHub?.emit('keyboardDidShow', { duration: 250, easing: 'keyboard', endCoordinates: { screenX: 0, screenY: 500, width: 400, height: 300 } })
  await tick()
  const shown = latest(wrapper.tag)
  const paddingBottom = readPaddingBottom(shown)
  // disabled forces effectiveInset 0, so any paddingBottom applied is 0 (never 300).
  check('enabled=false keeps the inset at 0', paddingBottom === undefined || paddingBottom === 0)
}

console.log(failures === 0 ? '\nvue-keyboard-avoiding-view.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
