// Linking now lives framework-agnostic in @symbiote/engine (imperative native-bridge
// module, no visual, no lifecycle). The React adapter re-exports it verbatim; the
// platform split (linking.ios/linking.android) lives inside engine. See ADR 0019.

export { Linking } from '@symbiote/engine';
export type { IUrlEvent } from '@symbiote/engine';
