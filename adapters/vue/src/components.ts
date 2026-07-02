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

import { h, type FunctionalComponent, type VNodeRef } from '@vue/runtime-core';
import type {
  ISymbioteEvent,
  IClassNameValue,
  IStyleProp,
  ITextStyle,
  IViewStyle,
} from '@symbiote/engine';
import type { IAccessibilityProps, IAriaProps, IResponderProps } from '@symbiote/components';
import { normalizeVueAttrs } from './utils/normalize-attrs';

export interface IViewProps extends IAccessibilityProps, IAriaProps, IResponderProps {
  style?: IStyleProp<IViewStyle>;
  // Vue's own template idiom for a registered class name (twin of React's `className`, added
  // the same session — see IViewProps.className there). Resolved through the shared style
  // registry by routeProp's centralized class+style merge (core/engine/src/node.ts). Scoped to
  // View/Text only for now, matching React's exact scope — extending it to every other
  // component (Image, ScrollView, Pressable, …) is real, deliberately deferred follow-up work,
  // not silently thinner: see the symbiote-sfc-style-compiler skill.
  class?: IClassNameValue;
  onPress?: (event: ISymbioteEvent) => void;
  onPressIn?: (event: ISymbioteEvent) => void;
  onPressOut?: (event: ISymbioteEvent) => void;
  onLayout?: (event: ISymbioteEvent) => void;
  onFocus?: (event: ISymbioteEvent) => void;
  onBlur?: (event: ISymbioteEvent) => void;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  hitSlop?: number | { top?: number; left?: number; bottom?: number; right?: number };
  id?: string;
  focusable?: boolean;
  collapsable?: boolean;
  removeClippedSubviews?: boolean;
  renderToHardwareTextureAndroid?: boolean;
  shouldRasterizeIOS?: boolean;
  needsOffscreenAlphaCompositing?: boolean;
  ref?: VNodeRef;
  key?: string | number | symbol;
}

export interface ITextProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<ITextStyle>;
  // See IViewProps.class — same registry, same merge precedence, same View/Text-only scope.
  class?: IClassNameValue;
  onPress?: (event: ISymbioteEvent) => void;
  onLongPress?: (event: ISymbioteEvent) => void;
  onPressIn?: (event: ISymbioteEvent) => void;
  onPressOut?: (event: ISymbioteEvent) => void;
  onLayout?: (event: ISymbioteEvent) => void;
  onTextLayout?: (event: ISymbioteEvent) => void;
  numberOfLines?: number;
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
  selectable?: boolean;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  allowFontScaling?: boolean;
  maxFontSizeMultiplier?: number | null;
  selectionColor?: string;
  ref?: VNodeRef;
  key?: string | number | symbol;
}

function hostComponent<Props extends object>(
  intrinsic: string,
  name: string,
): FunctionalComponent<Props> {
  // A functional component's ctx is Omit<SetupContext, 'expose'> (no instance to expose); let the
  // FunctionalComponent target infer the param types rather than annotate SetupContext.
  // normalizeVueAttrs folds kebab template props (:accessibility-label) to the RN camelCase contract.
  const component: FunctionalComponent<Props> = (_props, { slots, attrs }) =>
    h(
      intrinsic,
      normalizeVueAttrs(attrs),
      slots.default !== undefined ? slots.default() : undefined,
    );
  component.displayName = name;
  component.inheritAttrs = false;
  return component;
}

export const View = hostComponent<IViewProps>('symbiote-view', 'View');
export const Text = hostComponent<ITextProps>('symbiote-text', 'Text');
// Image is NOT a bare host primitive: it needs the shared fold (source/src/srcSet resolution,
// width/height → style, alt → accessibility) + the Image statics, so it lives in ./image as a
// functional component over renderImage. View/Text stay bare; they forward attrs verbatim.
