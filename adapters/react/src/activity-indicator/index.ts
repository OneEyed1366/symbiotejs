// Base / default ActivityIndicator: re-exports the iOS build. Metro overrides this with
// activity-indicator.ios.ts / .android.ts on a real host; under tsx / tsc / web the host
// config resolves here. Filename is the selector, no Platform.OS read. See ADR 0020.

export * from './index.ios';
