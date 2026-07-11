// Slider, the Angular lifecycle half. The logic (value/limit/disabled folds, the step-option
// layout) and the native render live in @symbiote-native/slider core, shared verbatim with the Vue
// adapter; here Angular supplies plain class fields (mirroring ActivityIndicatorBase/SwitchBase)
// plus real @Output() EventEmitters for the four native callbacks, and renders through
// DescriptorOutlet — the generic descriptor-to-Angular bridge — since this component has no
// imperative-ref need the Descriptor prop bag can't carry. The native RNCSlider view carries no
// symbiote metadata: the engine derives its events and color processors from the library's
// ViewConfig at runtime, registered by the side-effect import in ../../register (pulled in by the
// package barrel, NOT here, so this module and its tests stay free of the third-party spec). We
// never import the library's own React Slider component here — that component calls React hooks
// off the React dispatcher internally, which is null under Angular, so it would crash if rendered
// directly; instead the engine derives the native view's events and prop processors from its
// ViewConfig at runtime, keeping this wrapper framework-agnostic underneath.
//
// KNOWN GAP (deliberate, scoped by the task this module was built for): the custom `StepMarker`
// render slot (a per-adapter overlay element — a React FC, a Vue scoped slot) has no Angular
// equivalent yet. The natural analogue is a `@ContentChild(TemplateRef) stepMarker?:
// TemplateRef<IStepMarkerProps>` projected per step cell via `NgTemplateOutlet`, but wiring an
// embedded view per cell (constructing it, feeding its context, keeping it in step with
// DescriptorOutlet's imperative patch model, which has no notion of TemplateRefs) is
// disproportionate complexity for a path no real caller exercises today (examples/react/App.tsx's
// Slider usage has no step markers at all). Everything else — value/limits/disabled/colors/
// thumbImage/style/every event, and the DEFAULT numbered step indicator (`renderStepNumber`) — is
// fully implemented below; only the custom-marker overlay is unimplemented.

import {
  ChangeDetectorRef,
  Directive,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  type OnChanges,
} from '@angular/core';
import { anchorHostStyle, registerComposedComponent } from '@symbiote-native/angular';
import { resolveAccessibilityProps } from '@symbiote-native/components';
import type {
  IAccessibilityProps,
  IAccessibilityStateValue,
  IAriaProps,
  IDescriptor,
} from '@symbiote-native/components';
import { dlog, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  sanitizeSliderValue,
  resolveSliderDisabled,
  resolveSliderAccessibilityState,
  resolveSliderLowerLimit,
  resolveSliderUpperLimit,
  valueFromSliderEvent,
  shouldRenderStepsIndicator,
  resolveThumbTintColor,
  shouldPassNativeThumbImage,
  isInvalidLimitConfig,
  computeStepOptions,
  renderSlider,
  renderStepsIndicator,
  SLIDER_DEFAULT_MINIMUM_VALUE,
  SLIDER_DEFAULT_MAXIMUM_VALUE,
  SLIDER_DEFAULT_STEP,
  SLIDER_ON_CHANGE,
  SLIDER_ON_VALUE_CHANGE,
  SLIDER_ON_SLIDING_START,
  SLIDER_ON_SLIDING_COMPLETE,
  SLIDER_ON_ACCESSIBILITY_ACTION,
  type ISliderPlatform,
  type ISliderProps as ISliderBaseProps,
  type ISliderViewProps,
} from '../../core';

// Slider is a composed Angular component (its 'Slider' selector renders a real Fabric tree via
// DescriptorOutlet, never a raw view of that name) — self-registers as an anchor host instead of
// the adapter hardcoding a third-party package's selector. Both index.ios.ts and index.android.ts
// import this module before declaring @Component({ selector: 'Slider' }), so this runs regardless
// of which platform variant Metro picks.
registerComposedComponent('Slider');

export type ISliderProps = Omit<
  ISliderBaseProps,
  'onValueChange' | 'onSlidingStart' | 'onSlidingComplete' | 'onAccessibilityAction'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Narrows anchorHostStyle's `unknown` (it reads an opaque engine prop bag) to the shape
// ISliderProps['style'] actually declares — the same runtime guard the Angular adapter's
// ActivityIndicator uses for the identical reason: a style value is structurally opaque at the
// type level, so this only rules out non-objects, never validates individual style keys.
function asStyle(value: unknown): ISliderProps['style'] {
  return typeof value === 'object' && value !== null ? value : undefined;
}

@Directive()
export abstract class SliderBase implements ISliderProps, OnChanges {
  @Input() value?: number;
  @Input() minimumValue?: number;
  @Input() maximumValue?: number;
  @Input() step?: number;
  @Input() lowerLimit?: number;
  @Input() upperLimit?: number;
  @Input() minimumTrackTintColor?: ISliderProps['minimumTrackTintColor'];
  @Input() maximumTrackTintColor?: ISliderProps['maximumTrackTintColor'];
  @Input() thumbTintColor?: ISliderProps['thumbTintColor'];
  @Input() disabled?: boolean;
  @Input() inverted?: boolean;
  @Input() tapToSeek?: boolean;
  @Input() vertical?: boolean;
  @Input() thumbImage?: ISliderProps['thumbImage'];
  @Input() minimumTrackImage?: ISliderProps['minimumTrackImage'];
  @Input() maximumTrackImage?: ISliderProps['maximumTrackImage'];
  @Input() trackImage?: ISliderProps['trackImage'];
  @Input() thumbSize?: number;
  @Input() accessibilityUnits?: string;
  @Input() accessibilityIncrements?: readonly string[];
  @Input() renderStepNumber?: boolean;
  @Input() testID?: string;
  @Input() style?: ISliderProps['style'];

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
  @Input() onAccessibilityTap?: (event: ISymbioteEvent) => void;
  @Input() onMagicTap?: (event: ISymbioteEvent) => void;
  @Input() onAccessibilityEscape?: (event: ISymbioteEvent) => void;

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

  // The four native callbacks, as real EventEmitters — no v-model-style two-way twin (that was
  // Vue-specific v-model sugar; Angular has no equivalent concept here).
  @Output() readonly valueChange = new EventEmitter<number>();
  @Output() readonly slidingStart = new EventEmitter<number>();
  @Output() readonly slidingComplete = new EventEmitter<number>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();

  protected abstract readonly platform: ISliderPlatform;

  private readonly changeDetector = inject(ChangeDetectorRef);
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment, @symbiote-native/angular) — NOT the descriptor-outlet-
  // rendered wrapper the `descriptor` getter below builds. Merged FIRST so an explicit `style`
  // @Input still wins (flattenStyle's later-wins collapse), mirroring every other composed
  // component's anchor merge.
  private readonly elementRef = inject(ElementRef);

  // The value native last reported, kept only to mark the active step in the indicator. Not the
  // controlled value — the slider is uncontrolled during a drag (no snap-back), mirroring the
  // Vue lifecycle's `reportedValue` ref.
  private reportedValue: number | undefined;
  // The measured wrapper width the step indicator lays out against; 0 until the first layout.
  private width = 0;

  ngOnChanges(): void {
    // No fold needed here: `descriptor` is a getter re-evaluated on every OnPush check the
    // template's `[node]="descriptor"` binding triggers, so an @Input change already recomputes
    // the render on its own. OnChanges exists so this class satisfies the same lifecycle contract
    // as the rest of the input-driven components in this adapter.
  }

  protected readonly handleValueChange = (event: ISymbioteEvent): void => {
    const value = valueFromSliderEvent(event);
    if (value === undefined) return;
    this.reportedValue = value;
    this.valueChange.emit(value);
  };

  protected readonly handleSlidingStart = (event: ISymbioteEvent): void => {
    const value = valueFromSliderEvent(event);
    if (value !== undefined) this.slidingStart.emit(value);
  };

  protected readonly handleSlidingComplete = (event: ISymbioteEvent): void => {
    const value = valueFromSliderEvent(event);
    if (value !== undefined) this.slidingComplete.emit(value);
  };

  protected readonly handleAccessibilityAction = (event: ISymbioteEvent): void => {
    this.accessibilityAction.emit(event);
  };

  // Native onLayout fires through the engine's event dispatch (Renderer2.listen), OUTSIDE
  // Angular's zoneless change-detection notification, so mutating `width` alone would never
  // repaint the step indicator — nothing would tell the OnPush view it is dirty. The explicit
  // `markForCheck()` below is what actually schedules the repaint.
  protected readonly handleLayout = (event: ISymbioteEvent): void => {
    const layout = event.nativeEvent.layout;
    if (isRecord(layout) && typeof layout.width === 'number') {
      this.width = layout.width;
      this.changeDetector.markForCheck();
    }
  };

  private inputProps(): ISliderProps {
    return {
      value: this.value,
      minimumValue: this.minimumValue,
      maximumValue: this.maximumValue,
      step: this.step,
      lowerLimit: this.lowerLimit,
      upperLimit: this.upperLimit,
      minimumTrackTintColor: this.minimumTrackTintColor,
      maximumTrackTintColor: this.maximumTrackTintColor,
      thumbTintColor: this.thumbTintColor,
      disabled: this.disabled,
      inverted: this.inverted,
      tapToSeek: this.tapToSeek,
      vertical: this.vertical,
      thumbImage: this.thumbImage,
      minimumTrackImage: this.minimumTrackImage,
      maximumTrackImage: this.maximumTrackImage,
      trackImage: this.trackImage,
      thumbSize: this.thumbSize,
      accessibilityUnits: this.accessibilityUnits,
      accessibilityIncrements: this.accessibilityIncrements,
      renderStepNumber: this.renderStepNumber,
      testID: this.testID,
      style: [asStyle(anchorHostStyle(this.elementRef)), this.style],
      nativeID: this.nativeID,
      accessible: this.accessible,
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
      onAccessibilityTap: this.onAccessibilityTap,
      onMagicTap: this.onMagicTap,
      onAccessibilityEscape: this.onAccessibilityEscape,
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
    };
  }

  get descriptor(): IDescriptor {
    const props = resolveAccessibilityProps<ISliderProps>(this.inputProps());
    const {
      value,
      minimumValue: minimumValueInput,
      maximumValue: maximumValueInput,
      step: stepInput,
      lowerLimit: lowerLimitInput,
      upperLimit: upperLimitInput,
      disabled,
      inverted: invertedInput,
      thumbTintColor,
      thumbImage,
      accessibilityState,
      renderStepNumber,
      style,
      ...passthrough
    } = props;

    const minimumValue = minimumValueInput ?? SLIDER_DEFAULT_MINIMUM_VALUE;
    const maximumValue = maximumValueInput ?? SLIDER_DEFAULT_MAXIMUM_VALUE;
    const step = stepInput ?? SLIDER_DEFAULT_STEP;
    const lowerLimit = resolveSliderLowerLimit(lowerLimitInput);
    const upperLimit = resolveSliderUpperLimit(upperLimitInput);
    if (isInvalidLimitConfig(lowerLimit, upperLimit)) {
      dlog('Slider: lowerLimit must be smaller than upperLimit');
    }
    const inverted = invertedInput ?? false;
    const hasThumbImage = thumbImage !== undefined;
    // No custom-StepMarker slot on Angular yet (see the module doc comment above) — showSteps
    // only ever considers renderStepNumber.
    const showSteps = shouldRenderStepsIndicator(false, renderStepNumber);
    const nativeThumbImage = shouldPassNativeThumbImage(false, hasThumbImage)
      ? thumbImage
      : undefined;

    const view: ISliderViewProps = {
      value: sanitizeSliderValue(value),
      minimumValue,
      maximumValue,
      step,
      lowerLimit,
      upperLimit,
      disabled: resolveSliderDisabled(disabled, accessibilityState),
      inverted,
      thumbTintColor: resolveThumbTintColor(thumbTintColor, false, hasThumbImage),
      thumbImage: nativeThumbImage,
      accessibilityState: resolveSliderAccessibilityState(disabled, accessibilityState),
      width: this.width,
      style,
      passthrough: {
        ...passthrough,
        [SLIDER_ON_CHANGE]: this.handleValueChange,
        [SLIDER_ON_VALUE_CHANGE]: this.handleValueChange,
        [SLIDER_ON_SLIDING_START]: this.handleSlidingStart,
        [SLIDER_ON_SLIDING_COMPLETE]: this.handleSlidingComplete,
        [SLIDER_ON_ACCESSIBILITY_ACTION]: this.handleAccessibilityAction,
      },
    };

    if (!showSteps) {
      return renderSlider(view, this.platform, { onLayout: this.handleLayout });
    }

    const options = computeStepOptions(
      minimumValue,
      maximumValue,
      step,
      this.platform.stepResolution,
    );
    const currentValue = this.reportedValue ?? view.value ?? minimumValue;
    const steps = renderStepsIndicator({
      options,
      currentValue,
      width: this.width,
      renderStepNumber: renderStepNumber === true,
      thumbImage,
      inverted,
      platform: this.platform,
    });
    return renderSlider(view, this.platform, { steps, onLayout: this.handleLayout });
  }
}
