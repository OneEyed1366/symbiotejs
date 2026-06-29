// The gesture-responder handler props a View accepts. They are the public face of the
// responder negotiation @symbiote/engine's events run: the should-set gates decide who owns a
// touch (capture root->target, then bubble target->root, first true wins), and the lifecycle
// handlers receive the grant/move/release/terminate of the gesture. PanResponder produces
// exactly this shape as its `panHandlers`; a caller can also set any of these directly on a
// View. The should-set / termination-request gates return a boolean; the rest are
// side-effecting. Framework-agnostic (only ISymbioteEvent), so it lives in @symbiote/components
// and every adapter re-exports it as the base of its View props.

import type { ISymbioteEvent } from '@symbiote/engine';

type IResponderGate = (event: ISymbioteEvent) => boolean;
type IResponderHandler = (event: ISymbioteEvent) => void;

export interface IResponderProps {
  onStartShouldSetResponder?: IResponderGate;
  onStartShouldSetResponderCapture?: IResponderGate;
  onMoveShouldSetResponder?: IResponderGate;
  onMoveShouldSetResponderCapture?: IResponderGate;
  onResponderGrant?: IResponderHandler;
  onResponderReject?: IResponderHandler;
  onResponderStart?: IResponderHandler;
  onResponderMove?: IResponderHandler;
  onResponderEnd?: IResponderHandler;
  onResponderRelease?: IResponderHandler;
  onResponderTerminate?: IResponderHandler;
  onResponderTerminationRequest?: IResponderGate;
}
