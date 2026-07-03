// Re-export shim. IResponderProps is framework-agnostic (only ISymbioteEvent), so it moved to
// @symbiotejs/components as the shared base of every adapter's View props; kept here so the
// adapter's own modules keep importing it from one local path. App code reaches it via
// @symbiotejs/react.
export type { IResponderProps } from '@symbiotejs/components';
