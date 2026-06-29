// Re-export shim. The typed style surface moved to @symbiote/engine (it is agnostic and
// @symbiote/components needs it to type render fns); kept here so the adapter's own modules
// keep importing styles from one local path. App code reaches these via @symbiote/react.
export type {
  IViewStyle,
  ITextStyle,
  IStyleProp,
  IDimensionValue,
  IFlexAlign,
  IFlexJustify,
  ITransformProp,
  IBoxShadowValue,
  IDropShadowValue,
  IFilterFunction,
  IBlendMode,
} from '@symbiote/engine';
