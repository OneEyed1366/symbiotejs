// Host primitives for app code. Thin defineComponents over the intrinsic tags the
// renderer maps to Fabric: `inheritAttrs: false` + a manual attr spread passes every
// prop and `@event` (onX) straight through to patchProp -> routeProp. The full prop
// surface (typed ViewProps/TextProps, a11y folding) arrives with @symbiote/components.

import { defineComponent, h, type SetupContext } from '@vue/runtime-core'

function hostComponent(intrinsic: string, name: string) {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_props, { slots, attrs }: SetupContext) {
      return () => h(intrinsic, attrs, slots.default !== undefined ? slots.default() : undefined)
    },
  })
}

export const View = hostComponent('symbiote-view', 'View')
export const Text = hostComponent('symbiote-text', 'Text')
export const Image = hostComponent('symbiote-image', 'Image')
