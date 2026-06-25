// Share — base / default build (web, headless tsx, any target without a dedicated
// platform file). Metro overrides this with share.ios.ts / share.android.ts on a real
// iOS/Android host; off those, the iOS build is the fallback (its ActionSheetManager
// resolves null elsewhere → graceful reject). The barrel imports './share', which
// resolves here under tsc/tsx and to the platform file under Metro. See ADR 0019.

export * from './share.ios'
