import { Directive, ElementRef, EventEmitter, inject, Input, Output } from '@angular/core';
import {
  renderActivityIndicator,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IActivityIndicatorPlatform,
  type IActivityIndicatorProps,
  type IActivityIndicatorSize,
  type IAriaProps,
} from '@symbiotejs/components';
import type { ISymbioteEvent } from '@symbiotejs/engine';
import type { IDescriptor } from '@symbiotejs/components';
import { anchorHostStyle } from '../../primitives';

export type { IActivityIndicatorProps, IActivityIndicatorSize } from '@symbiotejs/components';

// Narrows anchorHostStyle's `unknown` (it reads an opaque engine prop bag) to the shape
// IActivityIndicatorProps['style'] actually declares, the same runtime guard image/shared.ts's
// asStyle() uses for the identical reason — a style value is structurally opaque at the type
// level, so this only rules out non-objects, never validates individual style keys.
function asStyle(value: unknown): IActivityIndicatorProps['style'] {
  return typeof value === 'object' && value !== null ? value : undefined;
}

// What the component itself takes as plain @Input()s: the full shared, cross-adapter
// IActivityIndicatorProps surface minus onLayout and the accessibility callbacks, which it
// exposes as real @Output() EventEmitters instead (see the class below), mirroring Pressable's
// IAngularPressableInputs split.
export type IActivityIndicatorInputs = Omit<
  IActivityIndicatorProps,
  | 'onLayout'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Directive()
export abstract class ActivityIndicatorBase implements IActivityIndicatorInputs {
  @Input() animating?: boolean;
  @Input() color?: string;
  @Input() hidesWhenStopped?: boolean;
  @Input() nativeID?: string;
  @Input() size?: IActivityIndicatorSize;
  @Input() style?: IActivityIndicatorProps['style'];
  @Input() testID?: string;
  // Real @Output()s. This component renders through DescriptorOutlet (`symbiote-descriptor-
  // outlet`), not a hand-written template: emitterHandler() below wraps each EventEmitter into a
  // plain callback under the SAME onX key the shared, cross-adapter IActivityIndicatorProps
  // expects, so the Descriptor's props bag still carries a function the engine's routeProp
  // recognizes and routes to setEventListener — the outlet's renderer.setProperty call never
  // sees an EventEmitter, only the wrapper.
  @Output() readonly layout = new EventEmitter<ISymbioteEvent>();

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
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();

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

  protected abstract readonly defaultColor: string | null;
  protected readonly nativeExtras: Readonly<Record<string, unknown>> = {};

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the descriptor-outlet-rendered wrapper the
  // `descriptor` getter below builds. Merged FIRST so an explicit `style` @Input still wins
  // (flattenStyle's later-wins collapse), mirroring every other composed component's anchor merge.
  private readonly elementRef = inject(ElementRef);

  // Stable bound wrappers (created ONCE, not per `descriptor` access) fed to emitterHandler below.
  // jsonEqual (core/engine/src/commit.ts) falls through to Object.is for a function leaf, so a
  // fresh closure built inside the `descriptor` getter would never equal the previous frame's
  // closure even when nothing changed — every CD pass would read as "props changed" and force a
  // real Fabric re-clone cascading up every ancestor to the root (the same hazard
  // AnimatedComponentBase.reconcile() and ScrollViewStickyHeader's onHostLayout guard against).
  private readonly onLayoutHandler = (event: ISymbioteEvent): void => this.layout.emit(event);
  private readonly onAccessibilityActionHandler = (event: ISymbioteEvent): void =>
    this.accessibilityAction.emit(event);
  private readonly onAccessibilityTapHandler = (event: ISymbioteEvent): void =>
    this.accessibilityTap.emit(event);
  private readonly onMagicTapHandler = (event: ISymbioteEvent): void => this.magicTap.emit(event);
  private readonly onAccessibilityEscapeHandler = (event: ISymbioteEvent): void =>
    this.accessibilityEscape.emit(event);

  get descriptor(): IDescriptor {
    const props = resolveAccessibilityProps<IActivityIndicatorProps>({
      animating: this.animating,
      color: this.color,
      hidesWhenStopped: this.hidesWhenStopped,
      nativeID: this.nativeID,
      size: this.size,
      style: [asStyle(anchorHostStyle(this.elementRef)), this.style],
      testID: this.testID,
      onLayout: this.emitterHandler(this.layout, this.onLayoutHandler),
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
      onAccessibilityAction: this.emitterHandler(
        this.accessibilityAction,
        this.onAccessibilityActionHandler,
      ),
      onAccessibilityTap: this.emitterHandler(
        this.accessibilityTap,
        this.onAccessibilityTapHandler,
      ),
      onMagicTap: this.emitterHandler(this.magicTap, this.onMagicTapHandler),
      onAccessibilityEscape: this.emitterHandler(
        this.accessibilityEscape,
        this.onAccessibilityEscapeHandler,
      ),
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

    const { animating, color, hidesWhenStopped, size, style, ...passthrough } = props;
    return renderActivityIndicator(
      {
        animating: animating !== false,
        color,
        hidesWhenStopped: hidesWhenStopped !== false,
        size: size ?? 'small',
        style,
        passthrough,
      },
      this.platform,
    );
  }

  private get platform(): IActivityIndicatorPlatform {
    return { defaultColor: this.defaultColor, nativeExtras: this.nativeExtras };
  }

  // Gates a STABLE bound handler behind `observed`, so an unbound event still resolves to
  // `undefined` in the descriptor's props bag — the same "undefined means nobody cares" contract
  // the old @Input() callback had, letting resolveAccessibilityProps drop the key entirely instead
  // of handing the engine a no-op function. `handler` must be one of the readonly bound fields
  // above, never a closure built here — see their doc comment for why.
  private emitterHandler(
    emitter: EventEmitter<ISymbioteEvent>,
    handler: (event: ISymbioteEvent) => void,
  ): ((event: ISymbioteEvent) => void) | undefined {
    return emitter.observed ? handler : undefined;
  }
}
