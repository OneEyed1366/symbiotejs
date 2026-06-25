// Base / default component-name table — re-exports the iOS table. Metro overrides this
// with component-names.ios.ts / component-names.android.ts on a real host; under tsx /
// tsc / web (no Metro) the host config resolves here. Filename is the selector, no
// Platform.OS read. See ADR 0020.

export * from './component-names.ios'
