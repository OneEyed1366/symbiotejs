// The intrinsic JSX types symbiote's host config maps to Fabric components, plus the
// machinery to turn a platform name table into the descriptors the host config reads.
// Per ADR 0020 the Fabric NAME of a primitive is platform-specific (iOS 'Switch' vs
// Android 'AndroidSwitch'), so the name tables live in component-names.ios.ts /
// .android.ts and the filename selects, no Platform.OS read. The isText flag is
// platform-invariant, so it lives here once and both tables share it.

// Every intrinsic our components.ts emits. A name table must cover exactly these keys,
// so a missing/renamed primitive is a compile error, not a silent gap at runtime.
export type ISymbioteIntrinsic =
  | 'symbiote-view'
  | 'symbiote-text'
  | 'symbiote-image'
  | 'symbiote-scroll-view'
  | 'symbiote-scroll-content'
  // Horizontal scroll is a SEPARATE native ViewManager on Android (AndroidHorizontalScrollView),
  // not RCTScrollView with a flag, so it needs its own intrinsic. On iOS both map back to
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
  | 'symbiote-input-accessory-view';

export interface IComponentDescriptor {
  component: string;
  isText: boolean;
}

// The only text-laying intrinsic; drives the RCTText / RCTVirtualText nesting choice
// (a <Text> inside another <Text> becomes a virtual span). Platform-invariant, so it is
// not part of the per-platform name table.
const TEXT_INTRINSICS: ReadonlySet<string> = new Set(['symbiote-text']);

// Assemble the descriptor map a platform file exports: each intrinsic's Fabric name from
// the platform table, paired with its invariant isText flag.
export function buildDescriptors(
  names: Readonly<Record<ISymbioteIntrinsic, string>>,
): Readonly<Record<string, IComponentDescriptor>> {
  const descriptors: Record<string, IComponentDescriptor> = {};
  for (const [intrinsic, component] of Object.entries(names)) {
    descriptors[intrinsic] = { component, isText: TEXT_INTRINSICS.has(intrinsic) };
  }
  return descriptors;
}

// Resolve an intrinsic type to its descriptor, against the platform-selected map. The
// logic is identical for every adapter (and was duplicated in React's host-config and
// Vue's component-names), so it lives here once; each platform file binds it to its own
// COMPONENT_DESCRIPTORS. A `symbiote-*` miss is a typo in our own code; any other string
// is a raw Fabric view name from a library's codegen component and flows through untouched
// (the engine derives its events/processors from the view's ViewConfig, no per-library glue).
export function makeDescriptorFor(
  descriptors: Readonly<Record<string, IComponentDescriptor>>,
): (type: string) => IComponentDescriptor {
  return type => {
    const descriptor = descriptors[type];
    if (descriptor !== undefined) return descriptor;
    if (type.startsWith('symbiote-')) {
      throw new Error(`Unknown symbiote component type: ${type}`);
    }
    return { component: type, isText: false };
  };
}
