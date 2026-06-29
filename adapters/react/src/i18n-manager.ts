// I18nManager now lives framework-agnostic in @symbiote/engine (imperative
// native-bridge module, no visual, no lifecycle). The React adapter re-exports it
// verbatim so the public surface is unchanged. See ADR 0019.

export { I18nManager } from '@symbiote/engine';
export type { II18nManagerConstants } from '@symbiote/engine';
