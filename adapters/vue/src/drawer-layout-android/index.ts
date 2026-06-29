// DrawerLayoutAndroid: base / off-Android fallback (the Vue twin of the React adapter's index.ts).
// AndroidDrawerLayout is Android-only, so everywhere except an Android host — where Metro picks
// index.android.ts — we render the content (the default slot) in a plain container and drop the
// navigation slot (RN's DrawerLayoutAndroidFallback shape). The imperative open/close are silent
// no-ops; there is no drawer to drive. The filename is the selector; no Platform.OS read. The Vue
// barrel imports './drawer-layout-android', which resolves here under tsx/tsc and to the .android
// file under Metro. See ADR 0019.

import { defineComponent, h, type SetupContext } from '@vue/runtime-core';
import { dlog, type IStyleProp, type IViewStyle } from '@symbiote/engine';
import type { IDrawerLayoutAndroidHandle } from '@symbiote/components';
import { View } from '../components';
import { normalizeVueAttrs } from '../normalize-attrs';

export type {
  IDrawerPosition,
  IDrawerLockMode,
  IKeyboardDismissMode,
  IDrawerState,
  IDrawerSlideEvent,
  IDrawerLayoutAndroidProps,
  IDrawerLayoutAndroidHandle,
} from './shared';

function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

export const DrawerLayoutAndroid = defineComponent({
  name: 'DrawerLayoutAndroid',
  inheritAttrs: false,
  setup(_props, { slots, attrs, expose }: SetupContext) {
    const handle: IDrawerLayoutAndroidHandle = {
      openDrawer: (): void => dlog('Vue DrawerLayoutAndroid.openDrawer no-op: off Android'),
      closeDrawer: (): void => dlog('Vue DrawerLayoutAndroid.closeDrawer no-op: off Android'),
    };
    expose(handle);

    return () => {
      dlog('Vue DrawerLayoutAndroid fallback: off-Android host, rendering content only');
      const normalized = normalizeVueAttrs(attrs);
      const style = isStyleProp(normalized.style) ? normalized.style : undefined;
      return h(View, { style }, () => (slots.default !== undefined ? slots.default() : []));
    };
  },
});
