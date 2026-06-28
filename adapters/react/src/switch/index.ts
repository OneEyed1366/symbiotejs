// Base / default Switch: re-exports the iOS build. Metro overrides this with switch.ios.ts /
// switch.android.ts on a real host; under tsx / tsc / web the host config resolves here.
// Filename is the selector, no Platform.OS read. See ADR 0020. The three-layer split (logic
// in @symbiote/components/state, render in @symbiote/components/view, hook in switch-shared)
// replaced the former monolithic Platform.OS-branching component.

export * from './index.ios';
