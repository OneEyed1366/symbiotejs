// The intrinsic JSX types symbiote's host config maps to Fabric components, plus the
// machinery to turn a platform name table into the descriptors the host config reads.
// Per ADR 0020 the Fabric NAME of a primitive is platform-specific (iOS 'Switch' vs
// Android 'AndroidSwitch'), so the name tables live in component-names.ios.ts /
// .android.ts and the filename selects — no Platform.OS read. The isText flag is
// platform-invariant, so it lives here once and both tables share it.

// Every intrinsic our components.ts emits. A name table must cover exactly these keys,
// so a missing/renamed primitive is a compile error, not a silent gap at runtime.
export type SymbioteIntrinsic =
  | 'symbiote-view'
  | 'symbiote-text'
  | 'symbiote-image'
  | 'symbiote-scroll-view'
  | 'symbiote-scroll-content'
  // Horizontal scroll is a SEPARATE native ViewManager on Android (AndroidHorizontalScrollView),
  // not RCTScrollView with a flag — so it needs its own intrinsic. On iOS both map back to
  // RCTScrollView (one view; the `horizontal` prop flips its axis). See ADR 0020.
  | 'symbiote-horizontal-scroll-view'
  | 'symbiote-horizontal-scroll-content'
  | 'symbiote-text-input'
  | 'symbiote-text-input-multiline'
  | 'symbiote-switch'
  | 'symbiote-activity-indicator'
  | 'symbiote-safe-area-view'
  | 'symbiote-modal'
  | 'symbiote-refresh-control'
  | 'symbiote-input-accessory-view'

export interface ComponentDescriptor {
  component: string
  isText: boolean
}

// The only text-laying intrinsic — drives the RCTText / RCTVirtualText nesting choice
// (a <Text> inside another <Text> becomes a virtual span). Platform-invariant, so it is
// not part of the per-platform name table.
const TEXT_INTRINSICS: ReadonlySet<string> = new Set(['symbiote-text'])

// Assemble the descriptor map a platform file exports: each intrinsic's Fabric name from
// the platform table, paired with its invariant isText flag.
export function buildDescriptors(
  names: Readonly<Record<SymbioteIntrinsic, string>>,
): Readonly<Record<string, ComponentDescriptor>> {
  const descriptors: Record<string, ComponentDescriptor> = {}
  for (const [intrinsic, component] of Object.entries(names)) {
    descriptors[intrinsic] = { component, isText: TEXT_INTRINSICS.has(intrinsic) }
  }
  return descriptors
}
