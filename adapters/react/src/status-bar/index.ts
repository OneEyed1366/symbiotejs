// Base / default StatusBar: re-exports the iOS build. Metro overrides this with
// status-bar.ios.ts / .android.ts on a real host; under tsx / tsc / web the host config
// resolves here. Filename is the selector, no Platform.OS read. See status-bar-shared.ts.

export * from './index.ios';
