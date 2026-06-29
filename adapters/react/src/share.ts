// Share now lives framework-agnostic in @symbiote/engine (imperative native-bridge
// module, no visual, no lifecycle). The React adapter re-exports it verbatim; the
// platform split (share.ios/share.android) lives inside engine. See ADR 0019.

export { Share } from '@symbiote/engine';
export type { IShareContent, IShareOptions, IShareAction } from '@symbiote/engine';
