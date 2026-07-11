// createAnimatedComponent for @symbiote-native/angular: the Angular twin of the React/Vue
// wrapper. React/Vue have a runtime HOC (`createAnimatedComponent(Component)` builds a
// fresh wrapped component on the fly). Angular has NO such idiom AND it cannot have one:
// the AOT-under-Metro build compiles every @Component at build
// time and ships NO JIT compiler to Hermes, so a runtime `Component({...})(class)` would
// throw. The idiomatic, AOT-safe equivalent is therefore an EXPLICIT set of standalone
// components — AnimatedView / AnimatedText / AnimatedImage / AnimatedScrollView — each a
// thin @Component over the matching host primitive, all sharing one abstract lifecycle
// base. The mechanism (build an AnimatedProps leaf, reduce animated props to current
// values for the first paint, bind the leaf to the committed host node, swap leaves on
// re-render, tear down on destroy) lives once in AnimatedComponentBase; only the per-host
// template differs.
//
// The framework-agnostic half (reduceProps / readPassthroughStyle / resolveHostNode /
// AnimatedProps / attachNativeEventHandler / isNativeAnimatedAvailable) comes from
// @symbiote-native/engine, shared verbatim with React and Vue. Angular supplies
// only the lifecycle wiring. The per-frame path NEVER goes through Angular change
// detection: value.setValue / animation -> flushValue -> AnimatedProps.update() ->
// setNativeProps(node), exactly as on the other adapters.

import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  Directive,
  ElementRef,
  inject,
  ViewChild,
  type AfterViewInit,
  type OnChanges,
  type OnDestroy,
  type Type,
} from '@angular/core';
import {
  isNativeAnimatedAvailable,
  isSymbioteNode,
  reduceProps,
  readPassthroughStyle,
  resolveHostNode,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { selectScrollIntrinsics } from '@symbiote-native/components';
import { Image, ScrollView, Text, View } from '../../components';
import {
  anchorHostStyle,
  ViewHost,
  TextHost,
  ImageHost,
  ScrollViewHost,
  SymbioteHostPropsDirective,
} from '../../primitives';
import { FlatList } from '../../components/flat-list';
import {
  IMAGE_INPUTS,
  IMAGE_OUTPUTS,
  ImageBase,
  resolveImageProps,
} from '../../components/image/shared';
import { SectionList } from '../../components/section-list';
import { AnimatedLeafBinder } from './animated-leaf-binder';

// RN's prop carrying explicit (already-rasterized) values that override the animated prop in
// the COMMITTED props (sticky-header passthrough). Named once so the directive input and the
// reconcile agree.
const PASSTHROUGH_PROP = 'passthroughAnimatedPropExplicitValues';

// The inputs every animated wrapper accepts. `style` is the (possibly animated) style — the
// common path (TouchableOpacity passes `[style, { opacity }]`). `animatedProps` is the generic
// escape hatch for any OTHER prop that may hold an AnimatedNode or an Animated.event handler,
// plus static host props to forward (the React/Vue `rest`). The passthrough drives native.
// Each concrete @Component re-lists these (Angular's inputs-on-base convention, mirroring
// Switch/Image), so they are inherited consistently.
export const ANIMATED_INPUTS = ['style', 'animatedProps', PASSTHROUGH_PROP];
export const ANIMATED_IMAGE_INPUTS = [...IMAGE_INPUTS, 'animatedProps', PASSTHROUGH_PROP];

// The shared lifecycle for every animated wrapper. Concrete subclasses add ONLY a @Component
// decorator (selector + the host-primitive template) — no behavior. Plain fields (no @Input
// here): the inputs are declared on each concrete via ANIMATED_INPUTS, the adapter convention.
// @Directive() (no selector) is the Angular-sanctioned decorator for an abstract base that
// declares lifecycle hooks — without it ngtsc rejects the inherited hooks (NG2007).
@Directive()
export abstract class AnimatedComponentBase implements AfterViewInit, OnChanges, OnDestroy {
  style: unknown;
  animatedProps: Record<string, unknown> | undefined;
  passthroughAnimatedPropExplicitValues: unknown;

  // This component's OWN host — every Animated* wrapper is a non-painting ANCHOR
  // (ANCHOR_HOST_COMPONENTS in renderer.ts), so a `class="..."` at the use site resolves onto
  // THIS element, never the real inner host primitive one level down (see anchorHostStyle's doc
  // comment in primitives/shared.ts — the same reason ScrollView's own scrollProps merges it in).
  private readonly elementRef = inject(ElementRef);

  // The directive sitting on the inner host primitive; its `node` is the committed SymbioteNode
  // the leaf binds to. Inherited by the decorated subclass (Angular collects base-class queries).
  @ViewChild(SymbioteHostPropsDirective) private hostDirective?: SymbioteHostPropsDirective;

  // The leaf-lifecycle orchestration (build/attach/swap/bind/detach an AnimatedProps leaf) is a
  // Pure Fabrication shared with AnimatedImage, which cannot extend this class (it must extend
  // ImageBase — see the file header). `resolveNode` stays a resolver, not a captured node: the
  // committed node only exists after `hostDirective` is populated post-view-init.
  private readonly leafBinder = new AnimatedLeafBinder(
    () => this.hostNode(),
    this.constructor.name,
  );
  // Set once the view (and the inner host directive) exists; ngOnChanges before then is a no-op.
  private viewReady = false;

  // The concrete props for the host element each change-detection pass: animated entries reduced
  // to their current value, then the passthrough style layered on top (last wins via the style
  // array, which the commit layer flattens) so the ShadowTree carries the current transform.
  get reducedProps(): Record<string, unknown> {
    const reduced = reduceProps(this.mergedProps());
    const passthroughStyle = readPassthroughStyle(this.passthroughAnimatedPropExplicitValues);
    if (passthroughStyle !== undefined) {
      reduced['style'] =
        reduced['style'] === undefined ? passthroughStyle : [reduced['style'], passthroughStyle];
    }
    reduced['style'] = [anchorHostStyle(this.elementRef), reduced['style']];
    return reduced;
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.reconcile();
  }

  ngOnChanges(): void {
    this.reconcile();
  }

  ngOnDestroy(): void {
    this.leafBinder.destroy();
  }

  // A non-stable [animatedProps]/[style] input (a fresh object literal in the template) pushes
  // a new reference on every change-detection pass of the HOST view, re-triggering this on every
  // unrelated interaction elsewhere in the app — DEBUG=1 turns this into a visible tick count in
  // AnimatedLeafBinder.reconcile, so an unexpectedly high rate for a component nobody is
  // animating is the tell (see AnimatedScrollView's stable-reference fix in examples/angular/App.ts).
  private reconcile(): void {
    if (!this.viewReady) return;
    const props = this.mergedProps();
    const hasPassthroughAnimatedValues =
      this.passthroughAnimatedPropExplicitValues !== null &&
      this.passthroughAnimatedPropExplicitValues !== undefined;
    const wantsNative = hasPassthroughAnimatedValues && isNativeAnimatedAvailable();
    this.leafBinder.reconcile(props, wantsNative);
  }

  // Merge the dedicated `style` input over the generic `animatedProps` bag into one props map —
  // the equivalent of React/Vue `rest`. `style` wins so `[style]` and `[animatedProps].style`
  // never disagree.
  private mergedProps(): Record<string, unknown> {
    const base = this.animatedProps ?? {};
    return this.style === undefined ? { ...base } : { ...base, style: this.style };
  }

  // The committed host node held by IDENTITY. resolveHostNode unwraps an imperative scroll
  // handle to the underlying SymbioteNode (View / Text already hand back the node directly);
  // the isSymbioteNode guard keeps us off a cast.
  private hostNode(): ISymbioteNode | null {
    const resolved = resolveHostNode(this.hostDirective?.node);
    return isSymbioteNode(resolved) ? resolved : null;
  }
}

@Component({
  selector: 'AnimatedView, symbiote-animated-view',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SymbioteHostPropsDirective, ViewHost],
  inputs: ANIMATED_INPUTS,
  template: `
    <symbiote-view [symbioteHostProps]="reducedProps">
      <ng-content></ng-content>
    </symbiote-view>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimatedView extends AnimatedComponentBase {}

@Component({
  selector: 'AnimatedText, symbiote-animated-text',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SymbioteHostPropsDirective, TextHost],
  inputs: ANIMATED_INPUTS,
  template: `
    <symbiote-text [symbioteHostProps]="reducedProps">
      <ng-content></ng-content>
    </symbiote-text>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimatedText extends AnimatedComponentBase {}

@Component({
  selector: 'AnimatedImage, symbiote-animated-image',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SymbioteHostPropsDirective, ImageHost],
  inputs: ANIMATED_IMAGE_INPUTS,
  outputs: IMAGE_OUTPUTS,
  template: `
    <symbiote-image
      [symbioteHostProps]="animatedImageProps"
      (accessibilityAction)="handleAccessibilityAction($event)"
      (accessibilityTap)="handleAccessibilityTap($event)"
      (magicTap)="handleMagicTap($event)"
      (accessibilityEscape)="handleAccessibilityEscape($event)"
      (loadStart)="handleLoadStart($event)"
      (load)="handleLoad($event)"
      (loadEnd)="handleLoadEnd($event)"
      (error)="handleError($event)"
      (progress)="handleProgress($event)"
      (partialLoad)="handlePartialLoad($event)"
    >
      <ng-content></ng-content>
    </symbiote-image>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimatedImage extends ImageBase implements AfterViewInit, OnChanges, OnDestroy {
  animatedProps: Record<string, unknown> | undefined;
  passthroughAnimatedPropExplicitValues: unknown;

  // AnimatedImage is a non-painting ANCHOR too (ANCHOR_HOST_COMPONENTS) — see the matching
  // comment on AnimatedComponentBase.elementRef.
  private readonly elementRef = inject(ElementRef);

  @ViewChild(SymbioteHostPropsDirective) private hostDirective?: SymbioteHostPropsDirective;

  // Same Pure Fabrication AnimatedComponentBase holds — see its matching comment. AnimatedImage
  // can't extend AnimatedComponentBase (it must extend ImageBase, see the file header), so it
  // gets the leaf-lifecycle via composition instead of duplicating it.
  private readonly leafBinder = new AnimatedLeafBinder(
    () => this.hostNode(),
    this.constructor.name,
  );
  private viewReady = false;

  get animatedImageProps(): Record<string, unknown> {
    const reduced = reduceProps(this.mergedProps());
    const passthroughStyle = readPassthroughStyle(this.passthroughAnimatedPropExplicitValues);
    if (passthroughStyle !== undefined) {
      reduced['style'] =
        reduced['style'] === undefined ? passthroughStyle : [reduced['style'], passthroughStyle];
    }
    const resolved = resolveImageProps(reduced);
    resolved['style'] = [anchorHostStyle(this.elementRef), resolved['style']];
    return resolved;
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.reconcile();
  }

  ngOnChanges(): void {
    this.reconcile();
  }

  ngOnDestroy(): void {
    this.leafBinder.destroy();
  }

  private reconcile(): void {
    if (!this.viewReady) return;
    const props = this.mergedProps();
    const hasPassthroughAnimatedValues =
      this.passthroughAnimatedPropExplicitValues !== null &&
      this.passthroughAnimatedPropExplicitValues !== undefined;
    const wantsNative = hasPassthroughAnimatedValues && isNativeAnimatedAvailable();
    this.leafBinder.reconcile(props, wantsNative);
  }

  private mergedProps(): Record<string, unknown> {
    const props: Record<string, unknown> = { ...(this.animatedProps ?? {}) };
    for (const [key, value] of Object.entries(this.imageInputProps)) {
      if (value !== undefined) props[key] = value;
    }
    return props;
  }

  private hostNode(): ISymbioteNode | null {
    const resolved = resolveHostNode(this.hostDirective?.node);
    return isSymbioteNode(resolved) ? resolved : null;
  }
}

@Component({
  selector: 'AnimatedScrollView, symbiote-animated-scroll-view',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SymbioteHostPropsDirective, ScrollViewHost],
  inputs: ANIMATED_INPUTS,
  template: `
    <symbiote-scroll-view [symbioteHostProps]="reducedProps">
      <symbiote-scroll-content [symbioteHostProps]="contentProps">
        <ng-content></ng-content>
      </symbiote-scroll-content>
    </symbiote-scroll-view>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimatedScrollView extends AnimatedComponentBase {
  // RN defaults nested scrolling ON (ScrollView.js `nestedScrollEnabled ?? true`) — Android
  // needs it explicit or a ScrollView nested inside another scrollable container never
  // receives touch (swallowed by the outer scroll view; iOS doesn't gate on this). The real
  // ScrollView component already defaults this (scroll-view/shared.ts), but AnimatedScrollView
  // talks to the raw primitive directly and has no such defaulting, so it must apply it too.
  //
  // scrollViewBaseStyle (overflow: 'scroll' + the per-axis flexDirection) is the OTHER thing
  // the real ScrollView applies that this bespoke template used to skip entirely — without it,
  // iOS Fabric never clips the scroll view's content to its own frame (Android's native
  // ViewGroup clips regardless of the style prop, which is why this was invisible there). This
  // wrapper has no dedicated `horizontal` input (only the generic `animatedProps`/`style`
  // surface), and its template is hardcoded to the vertical intrinsics
  // (symbiote-scroll-view/symbiote-scroll-content, not the horizontal variants), so
  // selectScrollIntrinsics is always called with isHorizontal=false here — matching what the
  // template can actually render.
  override get reducedProps(): Record<string, unknown> {
    const reduced = super.reducedProps;
    const { scrollViewBaseStyle } = selectScrollIntrinsics(false, undefined);
    const withScrollBase: Record<string, unknown> = {
      ...reduced,
      style: [scrollViewBaseStyle, reduced.style],
    };
    return withScrollBase.nestedScrollEnabled === undefined
      ? { ...withScrollBase, nestedScrollEnabled: true }
      : withScrollBase;
  }

  // The content (inner) view's props: contentStyle from the same intrinsics selection, plus
  // `collapsable: false` (the Android multi-child fix this file's tests already cover) — mirrors
  // the real ScrollView's own `contentProps` getter (scroll-view/shared.ts).
  get contentProps(): Record<string, unknown> {
    const { contentStyle } = selectScrollIntrinsics(false, undefined);
    return { style: contentStyle, collapsable: false };
  }
}

// List components are already explicit AOT-compiled Angular components with their own full input
// surface and inner ScrollView composition. Expose them in the Animated namespace without runtime
// synthesis; app code passes animated style/onScroll through the existing list inputs.
export const AnimatedFlatList = FlatList;
export const AnimatedSectionList = SectionList;

// Surface-parity shim for the React/Vue `createAnimatedComponent(Component)`. Angular cannot
// synthesize a component at runtime (no JIT under AOT/Metro — see the file header), so this maps
// the built-in primitives to their pre-authored wrappers and refuses anything else with a
// pointer to the real Angular idiom: author a standalone @Component extending
// AnimatedComponentBase.
export function createAnimatedComponent(base: unknown): Type<unknown> {
  if (base === View) return AnimatedView;
  if (base === Text) return AnimatedText;
  if (base === Image) return AnimatedImage;
  if (base === ScrollView) return AnimatedScrollView;
  throw new Error(
    'createAnimatedComponent: Angular cannot synthesize a component at runtime (no JIT compiler ' +
      'under AOT/Metro). Author an explicit standalone @Component extending AnimatedComponentBase ' +
      'instead. The built-in primitives View / Text / Image / ScrollView map to ' +
      'AnimatedView / AnimatedText / AnimatedImage / AnimatedScrollView.',
  );
}
