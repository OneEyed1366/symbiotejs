// @symbiote/shared — the retained shadow-tree + clone-on-write commit engine.
// Every framework adapter drives this tiny mutation API; all Fabric-specific
// logic (tag allocation, view-name resolution, clone-on-write, event
// normalization) lives behind it, in one place.

export {
  createElement,
  createRawText,
  appendChild,
  insertBefore,
  removeChild,
  setProp,
  setText,
  isSymbioteNode,
} from './node'
export type { SymbioteNode, NodeKind, SymbioteEvent, Listener } from './node'

export { SymbioteSurface, createSurface } from './surface'
export { setEventDispatcher } from './events'
export { setColorProcessor } from './commit'
export { flattenStyle } from './style'

export { getSlot } from './fabric'
export type {
  FabricSlot,
  FabricNode,
  FabricChildSet,
  FabricProps,
  FabricEventHandler,
  RootTag,
} from './fabric'
