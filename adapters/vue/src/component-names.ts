// Intrinsic tag -> Fabric view name for the thin slice. View/Text/Image share the same
// Fabric name on iOS and Android (RCTView / RCTText / RCTImageView), so no Metro
// .ios/.android split yet — the full per-platform descriptor tables arrive with
// @symbiote/components (Workstream B), reused by every adapter. Mirrors the React
// adapter's descriptorFor: a `symbiote-*` typo throws; any other string is a raw Fabric
// view name from a library's codegen component and flows through untouched.

export interface ComponentDescriptor {
  component: string
  isText: boolean
}

const DESCRIPTORS: Readonly<Record<string, ComponentDescriptor>> = {
  'symbiote-view': { component: 'RCTView', isText: false },
  'symbiote-text': { component: 'RCTText', isText: true },
  'symbiote-image': { component: 'RCTImageView', isText: false },
}

export function descriptorFor(type: string): ComponentDescriptor {
  const descriptor = DESCRIPTORS[type]
  if (descriptor !== undefined) return descriptor
  if (type.startsWith('symbiote-')) {
    throw new Error(`Unknown symbiote component type: ${type}`)
  }
  return { component: type, isText: false }
}
