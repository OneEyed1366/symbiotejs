// iOS Fabric component names. Metro picks this file on an iOS host; it is also the base
// (component-names.ts re-exports it) for headless tsx / tsc / web fallback. See ADR 0020.
// Fabric names are the codegen spec's registered name (the new-arch name), not the legacy
// paperComponentName (RCTSwitch, …).

import { buildDescriptors, type SymbioteIntrinsic } from './component-names-shared'
export type { SymbioteIntrinsic, ComponentDescriptor } from './component-names-shared'

const IOS_NAMES: Readonly<Record<SymbioteIntrinsic, string>> = {
  'symbiote-view': 'RCTView',
  'symbiote-text': 'RCTText',
  'symbiote-image': 'RCTImageView',
  'symbiote-scroll-view': 'RCTScrollView',
  'symbiote-scroll-content': 'RCTScrollContentView',
  // iOS uses one scroll view for both axes — horizontal is RCTScrollView with the
  // `horizontal` prop set, so these resolve identically to the vertical pair.
  'symbiote-horizontal-scroll-view': 'RCTScrollView',
  'symbiote-horizontal-scroll-content': 'RCTScrollContentView',
  'symbiote-text-input': 'RCTSinglelineTextInputView',
  'symbiote-text-input-multiline': 'RCTMultilineTextInputView',
  'symbiote-switch': 'Switch',
  'symbiote-activity-indicator': 'ActivityIndicatorView',
  'symbiote-safe-area-view': 'SafeAreaView',
  'symbiote-modal': 'ModalHostView',
  'symbiote-refresh-control': 'PullToRefreshView',
  'symbiote-input-accessory-view': 'RCTInputAccessoryView',
}

export const COMPONENT_DESCRIPTORS = buildDescriptors(IOS_NAMES)
