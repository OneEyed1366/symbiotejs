// Sticky headers: the Angular twin of adapters/{react,vue}/src/components/scroll-view/
// sticky-header.{tsx,ts}, the JS layer RN implements in ScrollView.js / ScrollViewStickyHeader.js.
//
// Source-based: RN does stickiness PURELY IN JS. A single `_scrollAnimatedValue` an Animated.event
// drives from `onScroll` feeds each flagged header's translateY through an interpolation that pins
// it to the top (or bottom, inverted) until the next header collides with it. The native Fabric
// scroll view does NOT honor `stickyHeaderIndices` on its own. The load-bearing top/inverted
// interpolation math (computeStickyInterpolation) lives framework-agnostic in @symbiotejs/components
// (ADR 0024); this file holds the Angular component shell, the layout state, and the interpolation
// build, sharing the math verbatim with React/Vue. Angular supplies only the lifecycle (inputs +
// manual change detection instead of useState/useEffect or refs/watch).
//
// This is the public sticky-header WRAPPER for explicit composition. ScrollView also auto-wraps
// projected direct children named by stickyHeaderIndices through its projection bridge (see
// projection.ts), because Angular templates cannot map <ng-content> children directly; that auto
// path intentionally uses this built-in wrapper rather than dynamically instantiating arbitrary
// custom component classes.

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  inject,
  type OnChanges,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import {
  type AnimatedInterpolation,
  AnimatedValue,
  Platform,
  dlog,
  type ISymbioteEvent,
} from '@symbiotejs/engine';
import {
  computeStickyInterpolation,
  readLayoutNumber,
  stickyDebounceMs,
  STICKY_HEADER_Z_INDEX,
  type IStickyHeaderProps,
} from '@symbiotejs/components';
import { AnimatedView } from '../../modules/animated';
import { anchorHostStyle } from '../../primitives';

// A custom sticky wrapper must accept the same shape the built-in does: the IStickyHeaderProps
// fields as inputs + the wrapped child via <ng-content>. Unlike React/Vue, Angular ScrollView cannot
// AOT-safely instantiate an arbitrary component Type while auto-projecting stickyHeaderIndices,
// because that renderer-level bridge only sees committed engine nodes, not a ViewContainerRef with
// Angular projectable nodes. This type remains public for explicit composition: compose your wrapper
// around <ScrollViewStickyHeader>/<symbiote-sticky-header> in the template when custom visuals are
// needed. Auto projection intentionally uses the built-in wrapper.
export type IStickyHeaderComponentType = unknown;

// One sticky header. Measures its own y/height via onLayout, interpolates the shared scroll offset
// into a translateY that keeps it pinned to the top (or bottom, inverted) until the next header
// collides with it, and drives that translate through the native driver when available so the pin
// tracks scroll on the UI thread (no JS jitter). Ported from ScrollViewStickyHeader.js, including
// the Fabric ShadowTree debounce path. The inputs (scrollAnimatedValue/nextHeaderLayoutY/…) never
// reach the host node: they configure the interpolation; only the resolved transform reaches
// AnimatedView (a scrollAnimatedValue on a host node would crash Android's folly::dynamic).
@Component({
  selector: 'ScrollViewStickyHeader, symbiote-sticky-header',
  standalone: true,
  imports: [AnimatedView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <AnimatedView
      [style]="headerStyle"
      [animatedProps]="headerAnimatedProps"
      [passthroughAnimatedPropExplicitValues]="passthrough"
    >
      <ng-content></ng-content>
    </AnimatedView>
  `,
})
export class ScrollViewStickyHeader
  implements Omit<IStickyHeaderProps, 'onLayout'>, OnInit, OnChanges, OnDestroy
{
  // A fresh fallback AnimatedValue keeps the component working if the parent ever fails to supply
  // one (the wrap invariant); held by IDENTITY in a plain field (Angular does not proxy fields).
  @Input() scrollAnimatedValue: AnimatedValue = new AnimatedValue(0);
  @Input() nextHeaderLayoutY: number | undefined = undefined;
  @Input() inverted: boolean | undefined = undefined;
  @Input() scrollViewHeight: number | undefined = undefined;
  // The parent's layout recorder (RN _onStickyHeaderLayout): records this header's own y so the
  // previous header learns its collision point. Called after the header measures.
  @Output() readonly layout = new EventEmitter<ISymbioteEvent>();

  private measured = false;
  private layoutY = 0;
  private layoutHeight = 0;
  // The animated node driving the transform (RN's animatedTranslateY). When the scroll value is
  // native (attachStickyScroll), this interpolation runs on the UI thread: the smooth pin.
  private animatedTranslateY: AnimatedInterpolation = new AnimatedValue(0).interpolate({
    inputRange: [-1, 0],
    outputRange: [0, 0],
  });
  // The debounced EXPLICIT translateY pushed to the committed transform via the passthrough, so the
  // Fabric ShadowTree (hit-testing) knows the pinned position while the native driver animates.
  private translateY: number | null = null;
  private haveReceivedInitialZeroTranslateY = true;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private listenerId: string | undefined;

  private readonly changeDetector = inject(ChangeDetectorRef);
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment in primitives/shared.ts) — NOT the inner AnimatedView
  // one level down.
  private readonly elementRef = inject(ElementRef);

  ngOnInit(): void {
    this.animatedTranslateY = this.scrollAnimatedValue.interpolate({
      inputRange: [-1, 0],
      outputRange: [0, 0],
    });
    this.rebuildInterpolation();
  }

  // Rebuild on any layout/collision input change (RN's effect deps: measured, layoutY, layoutHeight,
  // scrollViewHeight, nextHeaderLayoutY, inverted). scrollAnimatedValue is stable for one ScrollView.
  ngOnChanges(): void {
    this.rebuildInterpolation();
  }

  ngOnDestroy(): void {
    this.teardownInterpolation();
  }

  get headerStyle(): unknown {
    // collapsable:false keeps the wrapper a real Yoga node; zIndex paints the pinned header OVER the
    // rows scrolling under it. The interpolation node rides inside the transform; AnimatedView's
    // reduceProps rasterizes it into a numeric translateY for the committed tree. This component is
    // its own ANCHOR_HOST_COMPONENTS entry, so a `class="..."` at its use site resolves onto
    // `elementRef`, not the inner AnimatedView — merge it back in (anchorHostStyle's doc comment),
    // anchor style first so the fixed transform/zIndex below still wins on conflict.
    return [
      anchorHostStyle(this.elementRef),
      { transform: [{ translateY: this.animatedTranslateY }], zIndex: STICKY_HEADER_Z_INDEX },
    ];
  }

  // Stable reference (bound once) so AnimatedView's directive does not re-wire the layout listener
  // every change-detection pass.
  private readonly onHostLayout = (event: ISymbioteEvent): void => this.handleLayout(event);

  // Also a stable reference, not a getter: jsonEqual (commit.ts) can't structurally compare the
  // embedded onLayout function, so a fresh object here would read as "props changed" on every
  // change-detection pass and force a real Fabric re-clone that cascades up every ancestor to the
  // root (see AnimatedComponentBase.reconcile()'s identical warning) — every unrelated press
  // anywhere in the app, not just this header's own layout events. Not `private`: the template
  // binds it directly (`strictTemplates` requires template-bound members stay accessible).
  readonly headerAnimatedProps: Record<string, unknown> = {
    onLayout: this.onHostLayout,
    collapsable: false,
  };

  // The EXPLICIT debounced translateY overrides the committed transform for hit-testing while
  // animatedTranslateY does the smooth (native-driven) pin (RN ScrollViewStickyHeader.js).
  get passthrough(): { style: { transform: Array<{ translateY: number }> } } | null {
    return this.translateY !== null
      ? { style: { transform: [{ translateY: this.translateY }] } }
      : null;
  }

  // Record own y/height, mark measured, rebuild the interpolation, then fire the parent's recorder
  // (RN ScrollViewStickyHeader.js._onLayout order). The wrapped child keeps its own onLayout binding
  // (it is projected with its bindings intact), so unlike React/Vue we do not forward to it here.
  private handleLayout(event: ISymbioteEvent): void {
    const y = readLayoutNumber(event, 'y');
    const height = readLayoutNumber(event, 'height');
    if (y !== undefined) this.layoutY = y;
    if (height !== undefined) this.layoutHeight = height;
    this.measured = true;
    this.rebuildInterpolation();
    this.layout.emit(event);
    this.changeDetector.markForCheck();
  }

  // The animated value updates several times per frame during scroll; debounce it and push the
  // settled value into the committed transform so hit detection stays current (a Fabric-only issue,
  // worse on Android). A freshly-rebuilt interpolation re-emits 0; swallow that first zero (RN).
  private readonly animatedValueListener = ({ value }: { value: number | string }): void => {
    if (typeof value !== 'number') return;
    if (value === 0 && !this.haveReceivedInitialZeroTranslateY) {
      this.haveReceivedInitialZeroTranslateY = true;
      return;
    }
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.translateY = value;
      if (value !== 0) this.haveReceivedInitialZeroTranslateY = false;
      this.changeDetector.markForCheck();
    }, stickyDebounceMs(Platform.OS));
  };

  private rebuildInterpolation(): void {
    this.teardownInterpolation();
    const { inputRange, outputRange } = computeStickyInterpolation({
      measured: this.measured,
      inverted: this.inverted,
      scrollViewHeight: this.scrollViewHeight,
      layoutY: this.layoutY,
      layoutHeight: this.layoutHeight,
      nextHeaderLayoutY: this.nextHeaderLayoutY,
    });
    const interpolation = this.scrollAnimatedValue.interpolate({ inputRange, outputRange });
    // symbiote is always Fabric: listen to the settled value to keep the ShadowTree transform
    // current for hit-testing (RN attaches this listener only under Fabric).
    this.listenerId = interpolation.addListener(this.animatedValueListener);
    this.animatedTranslateY = interpolation;
    dlog(
      `Angular ScrollViewStickyHeader interpolation measured=${this.measured} y=${this.layoutY}`,
    );
  }

  private teardownInterpolation(): void {
    if (this.listenerId !== undefined) {
      this.animatedTranslateY.removeListener(this.listenerId);
      this.listenerId = undefined;
    }
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }
}
