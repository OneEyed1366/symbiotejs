// ImageBackground: the Angular lifecycle half. ImageBackground has NO native host of its own —
// it composes an outer View, an absolute-fill Image behind the user children, and the children
// on top. The composition math (the absolute-fill, the wrapper-dimension proxy onto the inner
// image, the imageStyle merge) lives framework-agnostic in @symbiotejs/components/renderImageBackground
// and is shared verbatim with React/Vue. React/Vue bridge the Descriptor it returns; Angular has
// no hyperscript bridge, so it composes with a TEMPLATE instead and reuses renderImageBackground
// ONLY to compute the inner image's merged style (read off the tree it returns) — the math stays
// shared, never reimplemented. The inner <Image> is the adapter's own Image component, which owns
// source resolution / a11y folding / event emission; ImageBackground forwards every Image prop onto
// it. `style` is the WRAPPER View style; `imageStyle` targets the inner image. Children paint AFTER
// the image (on top) via <ng-content>. The Angular twin of the React/Vue ImageBackground.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
} from '@angular/core';
import {
  renderImageBackground,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IImageProps,
  type IImageSourceProp,
  type IResizeMode,
} from '@symbiotejs/components';
import {
  resolveClassName,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiotejs/engine';
import { Image } from './image';
import { anchorHostStyle, ViewHost } from '../primitives';

// Mirrors React's IImageBackgroundProps minus children (Angular takes children via <ng-content>):
// every forwarding Image prop flows onto the inner image; `style` is the WRAPPER View style and
// `imageStyle` the inner image's, per <prop_types_split_agnostic_vs_per_adapter>.
export interface IAngularImageBackgroundProps extends Omit<IImageProps, 'style'> {
  style?: IStyleProp<IViewStyle>;
  // A bare string resolves through the shared style registry, like `class` on the wrapper.
  imageStyle?: IStyleProp<IViewStyle> | string;
}

// What the ImageBackground component itself takes as plain @Input()s: the full surface minus the
// inner Image's callback-shaped events, which it exposes as real @Output() EventEmitters instead
// (re-emitting the inner <Image>'s own already-converted outputs — see the template below).
export type IAngularImageBackgroundInputs = Omit<
  IAngularImageBackgroundProps,
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
  | 'onLoadStart'
  | 'onLoad'
  | 'onLoadEnd'
  | 'onError'
  | 'onProgress'
  | 'onPartialLoad'
>;

@Component({
  selector: 'ImageBackground',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [Image, ViewHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <symbiote-view [style]="wrapperStyle">
      <Image
        [source]="source"
        [defaultSource]="defaultSource"
        [loadingIndicatorSource]="loadingIndicatorSource"
        [style]="imageStyle"
        [resizeMode]="resizeMode"
        [resizeMethod]="resizeMethod"
        [tintColor]="tintColor"
        [blurRadius]="blurRadius"
        [capInsets]="capInsets"
        [fadeDuration]="fadeDuration"
        [progressiveRenderingEnabled]="progressiveRenderingEnabled"
        [src]="src"
        [srcSet]="srcSet"
        [alt]="alt"
        [width]="width"
        [height]="height"
        [crossOrigin]="crossOrigin"
        [referrerPolicy]="referrerPolicy"
        [testID]="testID"
        [nativeID]="nativeID"
        [accessible]="accessible"
        [accessibilityLabel]="folded.accessibilityLabel"
        [accessibilityHint]="folded.accessibilityHint"
        [accessibilityRole]="folded.accessibilityRole"
        [accessibilityState]="folded.accessibilityState"
        [accessibilityValue]="folded.accessibilityValue"
        [accessibilityActions]="folded.accessibilityActions"
        [accessibilityLabelledBy]="folded.accessibilityLabelledBy"
        [importantForAccessibility]="folded.importantForAccessibility"
        [accessibilityLiveRegion]="folded.accessibilityLiveRegion"
        [screenReaderFocusable]="folded.screenReaderFocusable"
        [accessibilityViewIsModal]="folded.accessibilityViewIsModal"
        [accessibilityElementsHidden]="folded.accessibilityElementsHidden"
        [accessibilityIgnoresInvertColors]="folded.accessibilityIgnoresInvertColors"
        [accessibilityLanguage]="folded.accessibilityLanguage"
        [accessibilityRespondsToUserInteraction]="folded.accessibilityRespondsToUserInteraction"
        [accessibilityShowsLargeContentViewer]="folded.accessibilityShowsLargeContentViewer"
        [accessibilityLargeContentTitle]="folded.accessibilityLargeContentTitle"
        (loadStart)="loadStart.emit($event)"
        (load)="load.emit($event)"
        (loadEnd)="loadEnd.emit($event)"
        (error)="error.emit($event)"
        (progress)="progress.emit($event)"
        (partialLoad)="partialLoad.emit($event)"
        (accessibilityAction)="accessibilityAction.emit($event)"
        (accessibilityTap)="accessibilityTap.emit($event)"
        (magicTap)="magicTap.emit($event)"
        (accessibilityEscape)="accessibilityEscape.emit($event)"
      />
      <ng-content></ng-content>
    </symbiote-view>
  `,
})
export class ImageBackground implements IAngularImageBackgroundInputs {
  // The inner <Image>'s events as real Angular events, re-emitted verbatim through
  // ImageBackground's own outputs: `(load)="load.emit($event)"`, not `[onLoad]="onLoad"`.
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Output() readonly loadStart = new EventEmitter<ISymbioteEvent>();
  @Output() readonly load = new EventEmitter<ISymbioteEvent>();
  @Output() readonly loadEnd = new EventEmitter<ISymbioteEvent>();
  @Output() readonly error = new EventEmitter<ISymbioteEvent>();
  @Output() readonly progress = new EventEmitter<ISymbioteEvent>();
  @Output() readonly partialLoad = new EventEmitter<ISymbioteEvent>();
  @Input() source?: IImageSourceProp;
  @Input() defaultSource?: IImageSourceProp;
  @Input() loadingIndicatorSource?: IImageSourceProp;
  @Input() style?: IStyleProp<IViewStyle>;
  @Input('imageStyle') imageStyleValue?: IStyleProp<IViewStyle> | string;
  @Input() resizeMode?: IResizeMode;
  @Input() resizeMethod?: IImageProps['resizeMethod'];
  @Input() tintColor?: string;
  @Input() blurRadius?: number;
  @Input() capInsets?: IImageProps['capInsets'];
  @Input() fadeDuration?: number;
  @Input() progressiveRenderingEnabled?: boolean;
  @Input() src?: string;
  @Input() srcSet?: string;
  @Input() alt?: string;
  @Input() width?: number;
  @Input() height?: number;
  @Input() crossOrigin?: 'anonymous' | 'use-credentials';
  @Input() referrerPolicy?: string;
  @Input() testID?: string;
  @Input() nativeID?: string;
  @Input() accessible?: boolean;
  @Input() accessibilityLabel?: string;
  @Input() accessibilityHint?: string;
  @Input() accessibilityRole?: IAccessibilityProps['accessibilityRole'];
  @Input() accessibilityState?: IAccessibilityStateValue;
  @Input() accessibilityValue?: IAccessibilityProps['accessibilityValue'];
  @Input() accessibilityActions?: IAccessibilityProps['accessibilityActions'];
  @Input() accessibilityLabelledBy?: string | string[];
  @Input() importantForAccessibility?: IAccessibilityProps['importantForAccessibility'];
  @Input() accessibilityLiveRegion?: IAccessibilityProps['accessibilityLiveRegion'];
  @Input() screenReaderFocusable?: boolean;
  @Input() accessibilityViewIsModal?: boolean;
  @Input() accessibilityElementsHidden?: boolean;
  @Input() accessibilityIgnoresInvertColors?: boolean;
  @Input() accessibilityLanguage?: string;
  @Input() accessibilityRespondsToUserInteraction?: boolean;
  @Input() accessibilityShowsLargeContentViewer?: boolean;
  @Input() accessibilityLargeContentTitle?: string;
  @Input() role?: IAriaProps['role'];
  @Input('aria-label') ariaLabel?: string;
  @Input('aria-labelledby') ariaLabelledBy?: string;
  @Input('aria-live') ariaLive?: IAriaProps['aria-live'];
  @Input('aria-hidden') ariaHidden?: boolean;
  @Input('aria-busy') ariaBusy?: boolean;
  @Input('aria-checked') ariaChecked?: boolean | 'mixed';
  @Input('aria-disabled') ariaDisabled?: boolean;
  @Input('aria-expanded') ariaExpanded?: boolean;
  @Input('aria-selected') ariaSelected?: boolean;
  @Input('aria-modal') ariaModal?: boolean;
  @Input('aria-valuemax') ariaValueMax?: number;
  @Input('aria-valuemin') ariaValueMin?: number;
  @Input('aria-valuenow') ariaValueNow?: number;
  @Input('aria-valuetext') ariaValueText?: string;

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the inner `symbiote-view [style]="wrapperStyle"`
  // one level down. Merged FIRST so the explicit `style` @Input still wins (flattenStyle's
  // later-wins collapse), mirroring every other composed component's anchor merge. `imageStyle`
  // below stays untouched per the ImageBackground-specific nuance: it targets the inner image, not
  // this component's own root.
  private readonly elementRef = inject(ElementRef);

  get wrapperStyle(): unknown {
    return [anchorHostStyle(this.elementRef), this.style];
  }

  // renderImageBackground owns the absolute-fill + wrapper-dimension-proxy + imageStyle merge
  // (shared verbatim with React/Vue); read the inner image Descriptor's style off the tree it
  // returns rather than reimplementing it. Only style/imageStyle drive that merge, so the image
  // bag is empty here — the inner <Image> below resolves source / a11y / events on its own.
  get imageStyle(): IStyleProp<IViewStyle> | undefined {
    // imageStyle targets the INNER image (renderImageBackground's own field); resolve a
    // class-name string here, before it flows into the merge.
    const resolvedImageStyleValue =
      typeof this.imageStyleValue === 'string'
        ? resolveClassName(this.imageStyleValue)
        : this.imageStyleValue;
    const inner = renderImageBackground({
      style: this.style,
      imageStyle: resolvedImageStyleValue,
      image: { passthrough: {} },
    }).children[0];
    return typeof inner === 'string'
      ? undefined
      : (inner.props.style as IStyleProp<IViewStyle> | undefined);
  }

  // Fold the web aria-*/role aliases into the canonical accessibility* props once per render, so the
  // inner image never sees an aria-* key (native ignores them) — the shared transform every adapter
  // runs. The inner <Image> re-runs the same fold idempotently over the already-folded props.
  get folded(): Partial<IAngularImageBackgroundProps> {
    return resolveAccessibilityProps({
      accessibilityLabel: this.accessibilityLabel,
      accessibilityHint: this.accessibilityHint,
      accessibilityRole: this.accessibilityRole,
      accessibilityState: this.accessibilityState,
      accessibilityValue: this.accessibilityValue,
      accessibilityActions: this.accessibilityActions,
      accessibilityLabelledBy: this.accessibilityLabelledBy,
      importantForAccessibility: this.importantForAccessibility,
      accessibilityLiveRegion: this.accessibilityLiveRegion,
      screenReaderFocusable: this.screenReaderFocusable,
      accessibilityViewIsModal: this.accessibilityViewIsModal,
      accessibilityElementsHidden: this.accessibilityElementsHidden,
      accessibilityIgnoresInvertColors: this.accessibilityIgnoresInvertColors,
      accessibilityLanguage: this.accessibilityLanguage,
      accessibilityRespondsToUserInteraction: this.accessibilityRespondsToUserInteraction,
      accessibilityShowsLargeContentViewer: this.accessibilityShowsLargeContentViewer,
      accessibilityLargeContentTitle: this.accessibilityLargeContentTitle,
      role: this.role,
      'aria-label': this.ariaLabel,
      'aria-labelledby': this.ariaLabelledBy,
      'aria-live': this.ariaLive,
      'aria-hidden': this.ariaHidden,
      'aria-busy': this.ariaBusy,
      'aria-checked': this.ariaChecked,
      'aria-disabled': this.ariaDisabled,
      'aria-expanded': this.ariaExpanded,
      'aria-selected': this.ariaSelected,
      'aria-modal': this.ariaModal,
      'aria-valuemax': this.ariaValueMax,
      'aria-valuemin': this.ariaValueMin,
      'aria-valuenow': this.ariaValueNow,
      'aria-valuetext': this.ariaValueText,
    });
  }
}
