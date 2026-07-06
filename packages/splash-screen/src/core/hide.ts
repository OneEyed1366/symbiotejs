// hide()/isVisible() carry zero React dependency upstream (react-native-bootsplash's own
// src/index.ts calls straight into its TurboModule) — framework-agnostic as-is, so every
// adapter re-exports this verbatim rather than re-wrapping it.
export { hide, isVisible } from 'react-native-bootsplash';
