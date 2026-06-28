// Vibration now lives framework-agnostic in @symbiote/engine (imperative native-bridge
// module, no visual, no lifecycle). The React adapter re-exports it verbatim; the
// platform split (vibration.ios/vibration.android) lives inside engine. See ADR 0019.

export { Vibration } from '@symbiote/engine';
