// Per-native-component event declarations — symbiote's slimmed ViewConfigRegistry.
// Mirrors React Native's ViewConfig: each Fabric component declares which event
// names it can emit. This is native-component knowledge (a Switch fires `change`,
// a ScrollView fires `scroll`), shared by every adapter — so it lives here, not in
// any one framework adapter.
//
// Flat-bag adapters (React / Vue / Solid) hand props and handlers mixed together
// and must split them. They consult this registry to tell an event handler
// (`onChange` -> `change`, a declared event) from a native prop that merely looks
// like one (`onTintColor` -> `tintColor`, NOT a declared event -> stays a prop and
// reaches Fabric). Structural adapters (Svelte `addEventListener`, Angular
// `Renderer2.listen`) deliver events pre-separated and call `setEventListener`
// directly, bypassing this entirely.

import { isRegisteredEvent } from './registry'

// Events every view can emit — RN's base ViewConfig. `press`/`pressIn`/`pressOut`
// are synthesized from the touch stream (see events.ts); `layout` is universal.
const BASE_EVENTS: readonly string[] = ['press', 'pressIn', 'pressOut', 'layout']

// An event set is platform-invariant — a text input emits `change` on iOS and Android
// alike; only the native component NAME differs (iOS RCTSinglelineTextInputView vs
// Android AndroidTextInput, iOS Switch vs Android AndroidSwitch). So each primitive's
// events are declared ONCE and keyed under BOTH platform names below. The table is
// consulted by the resolved native name (SymbioteNode.component), and only one
// platform's names ever exist at runtime, so the other platform's keys are inert — no
// Platform.OS branch, the names simply coexist. Missing the Android keys is what made
// onChangeText (and Switch/Modal/RefreshControl events) silently dead on Android: the
// onX prop failed isEventFor, fell to setProp, and no listener was ever registered.
const TEXT_INPUT_EVENTS: readonly string[] = [
  'change',
  'focus',
  'blur',
  'endEditing',
  'submitEditing',
  'keyPress',
  'selectionChange',
  'contentSizeChange',
]
const MODAL_EVENTS: readonly string[] = ['show', 'dismiss', 'requestClose', 'orientationChange']

// Fabric component name -> the events it emits beyond the base set. The keys match
// SymbioteNode.component (what createNode is called with). A component absent here
// still gets BASE_EVENTS, so a new primitive has working press/layout for free.
const COMPONENT_EVENTS: Readonly<Record<string, readonly string[]>> = {
  RCTImageView: ['loadStart', 'load', 'loadEnd', 'error', 'progress', 'partialLoad'],
  RCTScrollView: [
    'scroll',
    'scrollBeginDrag',
    'scrollEndDrag',
    'momentumScrollBegin',
    'momentumScrollEnd',
    'contentSizeChange',
  ],
  RCTSinglelineTextInputView: TEXT_INPUT_EVENTS,
  RCTMultilineTextInputView: TEXT_INPUT_EVENTS,
  AndroidTextInput: TEXT_INPUT_EVENTS,
  Switch: ['change'],
  AndroidSwitch: ['change'],
  ModalHostView: MODAL_EVENTS,
  RCTModalHostView: MODAL_EVENTS,
  PullToRefreshView: ['refresh'],
  AndroidSwipeRefreshLayout: ['refresh'],
}

const configCache = new Map<string, ReadonlySet<string>>()

// The built-in event names `component` can emit (its own + the base set). Cached;
// the registry layer is consulted live in isEventFor so a later registration is
// never masked by a stale cache entry.
function eventNamesFor(component: string): ReadonlySet<string> {
  let set = configCache.get(component)
  if (set === undefined) {
    set = new Set([...BASE_EVENTS, ...(COMPONENT_EVENTS[component] ?? [])])
    configCache.set(component, set)
  }
  return set
}

// True when `listenerName` is an event `component` emits, false when it is an
// ordinary native prop. This is the single authority for the event-vs-prop split —
// the name alone never decides. Built-ins first, then any third-party registration.
export function isEventFor(component: string, listenerName: string): boolean {
  if (eventNamesFor(component).has(listenerName)) return true
  return isRegisteredEvent(component, listenerName)
}
