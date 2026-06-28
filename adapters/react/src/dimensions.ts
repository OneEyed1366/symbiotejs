// Dimensions moved to @symbiote/engine (a framework-agnostic device-state module re-exported
// by every adapter). This thin re-export keeps @symbiote/react's public surface identical.
export { Dimensions } from '@symbiote/engine';
export type {
  IDisplayMetrics,
  IDisplayMetricsAndroid,
  IDimensionsPayload,
  IDimensionsSet,
  IDimensionsKey,
  IDimensionsChangeListener,
  IDimensionsStatic,
} from '@symbiote/engine';
