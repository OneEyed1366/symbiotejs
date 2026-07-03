// Dimensions moved to @symbiotejs/engine (a framework-agnostic device-state module re-exported
// by every adapter). This thin re-export keeps @symbiotejs/react's public surface identical.
export { Dimensions } from '@symbiotejs/engine';
export type {
  IDisplayMetrics,
  IDisplayMetricsAndroid,
  IDimensionsPayload,
  IDimensionsSet,
  IDimensionsKey,
  IDimensionsChangeListener,
  IDimensionsStatic,
} from '@symbiotejs/engine';
