// Base / default AccessibilityInfo: re-exports the iOS build. Metro overrides this with
// accessibility-info.ios.ts / .android.ts on a real host; under tsx / tsc / web the host
// config resolves here. Filename is the selector, no Platform.OS read. See
// accessibility-info-shared.ts.

export * from './index.ios';
