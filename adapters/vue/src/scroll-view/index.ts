// Base / default ScrollView. Re-exports the iOS build. Metro overrides this with
// scroll-view.ios.ts / scroll-view.android.ts on a real host; under tsx / tsc / web the host
// resolves here. Filename is the selector, no Platform.OS read. See ADR 0020 / 0024.

export * from './index.ios';
