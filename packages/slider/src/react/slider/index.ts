// Base entry for headless / tsc: re-exports the iOS variant (Metro picks index.ios / index.android
// per platform via filename selection; this no-suffix file is what tsx/vitest resolve). ADR 0026.

export { Slider } from './index.ios';
