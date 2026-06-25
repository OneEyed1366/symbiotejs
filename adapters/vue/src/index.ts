// @symbiote/vue — a thin Vue 3 reconciler over @symbiote/engine. createRenderer maps
// each RendererOptions call onto the engine's mutation API; all Fabric clone-on-write
// lives in the engine, shared with every other adapter. App code names only @symbiote/vue.

export { mount, stopSurface } from './render'
export { View, Text, Image } from './components'
export { createSymbioteRenderer } from './renderer'

// Re-export the framework-agnostic engine surface (pure utilities + diagnostics).
export {
  Platform,
  StyleSheet,
  processColor,
  setColorProcessor,
  dlog,
  isDebug,
} from '@symbiote/engine'
export type { SymbioteEvent, SymbioteNode, RootTag } from '@symbiote/engine'
