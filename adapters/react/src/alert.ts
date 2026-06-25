// Alert — base / default build (web, headless tsx, any target without a dedicated platform
// file). Metro overrides this with alert.ios.ts / alert.android.ts on a real iOS/Android
// host; off those, the iOS build is the fallback (its AlertManager resolves null elsewhere
// → graceful no-op). The barrel imports './alert', which resolves here under tsc/tsx and to
// the platform file under Metro. The `export *` re-exports the public type names
// (AlertType, AlertButtonStyle, AlertButton, AlertButtons, AlertOptions) so the barrel's
// `export type { ... } from './alert'` still resolves. See ADR 0019.

export * from './alert.ios'
