// The gesture-responder handler props a View accepts. They are the public face of
// the responder negotiation shared/events.ts runs: the should-set gates decide who
// owns a touch (capture root->target, then bubble target->root, first true wins),
// and the lifecycle handlers receive the grant/move/release/terminate of the gesture.
// PanResponder produces exactly this shape as its `panHandlers`; a caller can also set
// any of these directly on a View. The should-set / termination-request gates return a
// boolean; the rest are side-effecting. Declared here (not inlined on ViewProps) so the
// set stays in one place and reads as one concept.

import type { SymbioteEvent } from '@symbiote/engine'

type ResponderGate = (event: SymbioteEvent) => boolean
type ResponderHandler = (event: SymbioteEvent) => void

export interface ResponderProps {
  onStartShouldSetResponder?: ResponderGate
  onStartShouldSetResponderCapture?: ResponderGate
  onMoveShouldSetResponder?: ResponderGate
  onMoveShouldSetResponderCapture?: ResponderGate
  onResponderGrant?: ResponderHandler
  onResponderReject?: ResponderHandler
  onResponderStart?: ResponderHandler
  onResponderMove?: ResponderHandler
  onResponderEnd?: ResponderHandler
  onResponderRelease?: ResponderHandler
  onResponderTerminate?: ResponderHandler
  onResponderTerminationRequest?: ResponderGate
}
