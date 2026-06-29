// Android Fabric component names. Metro picks this file on an Android host. See ADR 0020.
// Each name is the ViewManager's REACT_CLASS in react-native/ReactAndroid/.../views/**.
// device-verify-pending: source-confirmed from RN's Android ViewManagers, proven on a
// real host by the absence of a "Can't find ViewManager '<name>'" red box.

import { buildDescriptors, makeDescriptorFor, type ISymbioteIntrinsic } from './shared';
export type { ISymbioteIntrinsic, IComponentDescriptor } from './shared';

const ANDROID_NAMES: Readonly<Record<ISymbioteIntrinsic, string>> = {
  'symbiote-view': 'RCTView',
  'symbiote-text': 'RCTText',
  'symbiote-image': 'RCTImageView',
  'symbiote-scroll-view': 'RCTScrollView',
  // RN's VScrollContentViewNativeComponent is `Platform.OS === 'android' ? View : …`,
  // so a vertical scroll's content is a plain RCTView on Android, not RCTScrollContentView.
  'symbiote-scroll-content': 'RCTView',
  // Horizontal scroll on Android is its own ViewManager; RCTScrollView is vertical-only and
  // ignores `horizontal`. RN routes it to AndroidHorizontalScrollView with a dedicated content
  // view (HScrollViewNativeComponents.js: `Platform.OS === 'android' ? AndroidHorizontal… : …`).
  'symbiote-horizontal-scroll-view': 'AndroidHorizontalScrollView',
  'symbiote-horizontal-scroll-content': 'AndroidHorizontalScrollContentView',
  // Android has one text-input ViewManager for both single- and multiline.
  'symbiote-text-input': 'AndroidTextInput',
  'symbiote-text-input-multiline': 'AndroidTextInput',
  'symbiote-switch': 'AndroidSwitch',
  'symbiote-activity-indicator': 'AndroidProgressBar',
  'symbiote-safe-area-view': 'RCTSafeAreaView',
  'symbiote-modal': 'RCTModalHostView',
  'symbiote-refresh-control': 'AndroidSwipeRefreshLayout',
  // iOS-only primitive; RN ships no Android InputAccessoryView. Degrade to a plain
  // container so an iOS-targeted usage doesn't red-box on Android.
  'symbiote-input-accessory-view': 'RCTView',
};

export const COMPONENT_DESCRIPTORS = buildDescriptors(ANDROID_NAMES);
export const descriptorFor = makeDescriptorFor(COMPONENT_DESCRIPTORS);
