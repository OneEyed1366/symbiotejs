// Base / default Platform — re-exports the iOS implementation. Metro overrides this
// with platform.ios.ts / platform.android.ts on a real host; under tsc / tsx / web
// (no Metro) resolution lands here. The filename is the selector — no Platform.OS read.
// See .docs/decisions/0022 (and 0020 for the same split on component names).

export * from './platform.ios'
