// Base / default Switch. Re-exports the iOS build. Metro overrides this with switch.ios.ts /
// switch.android.ts on a real host; under tsx / tsc / web the host resolves here. Filename is
// the selector, no Platform.OS read. See ADR 0020. Switch is the first component to bring the
// state half (the reducer) into the Vue adapter: render-and-state, not render-only.

export * from './index.ios';
