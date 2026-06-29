// ActivityIndicator, the Vue lifecycle half. The render (size translation, wrapper +
// spinner, color omission) lives framework-agnostic in @symbiote/components and is shared
// verbatim with the React adapter; here Vue only normalizes inputs, calls the render fn,
// and bridges the Descriptor to a vnode. No reactivity of its own; this component is
// render-only (the spinner animates natively).
//
// Inputs arrive as attrs, not a typed props block, the same passthrough shape as
// components.ts. RN's per-platform bits (iOS GRAY default; Android theme/null + styleAttr +
// indeterminate) are supplied by the .ios/.android files via `IActivityIndicatorPlatform`.

import { defineComponent, type SetupContext } from '@vue/runtime-core';
import { renderActivityIndicator } from '@symbiote/components';
import type { IActivityIndicatorPlatform, IActivityIndicatorSize } from '@symbiote/components';
import type { IViewStyle } from '@symbiote/engine';
import { descriptorToVue } from '../descriptor-to-vue';
import { normalizeVueAttrs } from '../normalize-attrs';

function normalizeSize(size: unknown): IActivityIndicatorSize {
  if (size === 'large') return 'large';
  if (typeof size === 'number') return size;
  return 'small';
}

// Narrow attrs.style to a plain ViewStyle object (assignable to the render fn's StyleProp
// param) without a cast. Array/registered styles degrade to undefined; the engine's own
// flatten handles those when an app passes them; the wrapper only needs the object form.
function isViewStyleObject(value: unknown): value is IViewStyle {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createActivityIndicator(platform: IActivityIndicatorPlatform) {
  return defineComponent({
    name: 'ActivityIndicator',
    inheritAttrs: false,
    setup(_props, { attrs: rawAttrs }: SetupContext) {
      return () => {
        // Defaults match RN (animating / hidesWhenStopped true, size 'small'); the rest of
        // attrs (testID, accessibility, onLayout) forwards onto the wrapper via passthrough.
        const attrs = normalizeVueAttrs(rawAttrs);
        const { animating, color, hidesWhenStopped, size, style, ...passthrough } = attrs;
        return descriptorToVue(
          renderActivityIndicator(
            {
              animating: animating !== false,
              hidesWhenStopped: hidesWhenStopped !== false,
              size: normalizeSize(size),
              color: typeof color === 'string' ? color : undefined,
              style: isViewStyleObject(style) ? style : undefined,
              passthrough,
            },
            platform,
          ),
        );
      };
    },
  });
}
