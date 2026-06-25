// Linking — base / default build (web, headless tsx, any target without a dedicated
// platform file). Metro overrides this with linking.ios.ts / linking.android.ts on a
// real iOS/Android host; off those, the iOS build is the fallback (its LinkingManager
// resolves null elsewhere → graceful no-op). The barrel imports './linking', which
// resolves here under tsc/tsx and to the platform file under Metro. See ADR 0019.

export * from './linking.ios'
