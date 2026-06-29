// Host primitives for app code. Thin FUNCTIONAL components over the intrinsic tags the
// renderer maps to Fabric: `inheritAttrs: false` + a manual attr spread passes every
// prop and `@event` (onX) straight through to patchProp -> routeProp. The full prop
// surface (typed ViewProps/TextProps, a11y folding) arrives with @symbiote/components.
//
// FUNCTIONAL, not a stateful defineComponent: a functional component has no instance, so
// a template/function ref on it falls through to its single root host element (the raw
// SymbioteNode), exactly like React's functional View hands back its host instance. A
// stateful component's ref would resolve to a useless component proxy, which is why
// createAnimatedComponent (which captures the host node via that ref) needs the fall-through.

import { h, type FunctionalComponent } from '@vue/runtime-core';
import { normalizeVueAttrs } from './normalize-attrs';

function hostComponent(intrinsic: string, name: string): FunctionalComponent {
  // A functional component's ctx is Omit<SetupContext, 'expose'> (no instance to expose); let the
  // FunctionalComponent target infer the param types rather than annotate SetupContext.
  // normalizeVueAttrs folds kebab template props (:accessibility-label) to the RN camelCase contract.
  const component: FunctionalComponent = (_props, { slots, attrs }) =>
    h(
      intrinsic,
      normalizeVueAttrs(attrs),
      slots.default !== undefined ? slots.default() : undefined,
    );
  component.displayName = name;
  component.inheritAttrs = false;
  return component;
}

export const View = hostComponent('symbiote-view', 'View');
export const Text = hostComponent('symbiote-text', 'Text');
// Image is NOT a bare host primitive: it needs the shared fold (source/src/srcSet resolution,
// width/height → style, alt → accessibility) + the Image statics, so it lives in ./image as a
// functional component over renderImage. View/Text stay bare; they forward attrs verbatim.
