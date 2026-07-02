// Co-located Angular-driven test (ADR 0025) for the @symbiote/slider Angular wrapper. The native
// RNCSlider carries no symbiote metadata — the engine DERIVES its events + tint processors from an
// injected codegen-shaped ViewConfig (the same shape the React/Vue adapters' slider.test inject,
// the same shape RN's ReactNativeViewConfigRegistry holds on a real host). We import the Slider
// component from '.' (NOT the package barrel) so the third-party native-spec side-effect
// (../register) never loads headless. Proves: the wrapper paints the raw RNCSlider leaf inside
// its centering View, folds value/disabled/limits faithfully to the library, forwards + processes
// the tints, and maps the native value/sliding/accessibility-action events onto the
// valueChange/slidingStart/slidingComplete/accessibilityAction outputs.

import '@angular/compiler';
import { Component, Input } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote/angular';
import { clearGlobalStyles, registerStyles } from '@symbiote/engine';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';
import { Slider } from '.';

const ROOT_TAG = 312;
const SLIDER_VIEW = 'RNCSlider';

const fakeColor = (value: unknown): string => `processed(${value})`;

// The codegen-shaped config the engine derives from: both value rails (bubbling), the two sliding
// rails + accessibility (direct), plain pass-through attributes, and the tint processors.
const RNC_SLIDER_VIEW_CONFIG = {
  bubblingEventTypes: {
    topChange: { phasedRegistrationNames: { bubbled: 'onChange', captured: 'onChangeCapture' } },
    topRNCSliderValueChange: {
      phasedRegistrationNames: {
        bubbled: 'onRNCSliderValueChange',
        captured: 'onRNCSliderValueChangeCapture',
      },
    },
  },
  directEventTypes: {
    topRNCSliderSlidingStart: { registrationName: 'onRNCSliderSlidingStart' },
    topRNCSliderSlidingComplete: { registrationName: 'onRNCSliderSlidingComplete' },
    topRNCSliderAccessibilityAction: { registrationName: 'onRNCSliderAccessibilityAction' },
  },
  validAttributes: {
    value: true,
    minimumValue: true,
    maximumValue: true,
    step: true,
    lowerLimit: true,
    upperLimit: true,
    inverted: true,
    disabled: true,
    minimumTrackTintColor: { process: fakeColor },
    maximumTrackTintColor: { process: fakeColor },
    thumbTintColor: { process: fakeColor },
  },
};

const fabric = installFabric();
setNativeViewConfigSource(name => (name === SLIDER_VIEW ? RNC_SLIDER_VIEW_CONFIG : undefined));

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: SliderHost | undefined;

@Component({
  selector: 'symbiote-slider-host',
  standalone: true,
  imports: [Slider],
  template: `
    <Slider
      [value]="value"
      [minimumValue]="minimumValue"
      [maximumValue]="maximumValue"
      [step]="step"
      [lowerLimit]="lowerLimit"
      [upperLimit]="upperLimit"
      [disabled]="disabled"
      [minimumTrackTintColor]="minimumTrackTintColor"
      [maximumTrackTintColor]="maximumTrackTintColor"
      [thumbTintColor]="thumbTintColor"
      [accessibilityState]="accessibilityState"
      [renderStepNumber]="renderStepNumber"
      (valueChange)="onValueChange($event)"
      (slidingStart)="onSlidingStart($event)"
      (slidingComplete)="onSlidingComplete($event)"
      (accessibilityAction)="onAccessibilityAction($event)"
    />
  `,
})
class SliderHost {
  @Input() value?: number;
  @Input() minimumValue?: number;
  @Input() maximumValue?: number;
  @Input() step?: number;
  @Input() lowerLimit?: number;
  @Input() upperLimit?: number;
  @Input() disabled?: boolean;
  @Input() minimumTrackTintColor?: string;
  @Input() maximumTrackTintColor?: string;
  @Input() thumbTintColor?: string;
  @Input() accessibilityState?: { disabled?: boolean };
  @Input() renderStepNumber?: boolean;

  onValueChange = vi.fn();
  onSlidingStart = vi.fn();
  onSlidingComplete = vi.fn();
  onAccessibilityAction = vi.fn();

  constructor() {
    // Captures the live component instance so the test can drive its signals after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  capturedHost = undefined;
  fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

function sliderNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no ${SLIDER_VIEW} was created`);
  return node;
}

async function mountSlider(initialProps: Record<string, unknown>): Promise<void> {
  mount(ROOT_TAG, SliderHost, { initialProps });
  await tick();
}

describe('Angular Slider wrapper', () => {
  it('paints the raw RNCSlider leaf inside a centering wrapper View', async () => {
    await mountSlider({ value: 0.5, minimumValue: 0, maximumValue: 1, step: 0.1 });
    const props = sliderNode().props;
    expect(props.value).toBe(0.5);
    expect(props.minimumValue).toBe(0);
    expect(props.maximumValue).toBe(1);
    expect(props.step).toBe(0.1);
    // The native leaf lives under a symbiote-view wrapper (RCTView), not at the root.
    expect(fabric.find(n => n.viewName === 'RCTView')).toBeDefined();
  });

  it('defaults range + limits the way the library wrapper does', async () => {
    await mountSlider({ value: 0.3 });
    const props = sliderNode().props;
    expect(props.minimumValue).toBe(0);
    expect(props.maximumValue).toBe(1);
    expect(props.step).toBe(0);
    expect(props.lowerLimit).toBe(Number.MIN_SAFE_INTEGER);
    expect(props.upperLimit).toBe(Number.MAX_SAFE_INTEGER);
    expect(props.inverted).toBe(false);
    expect(props.disabled).toBe(false);
  });

  it('sanitizes a falsy/NaN value to undefined (library passedValue quirk)', async () => {
    await mountSlider({ value: 0 });
    expect(sliderNode().props.value).toBeUndefined();
    unmount(ROOT_TAG);
    fabric.reset();
    await mountSlider({ value: Number.NaN });
    expect(sliderNode().props.value).toBeUndefined();
  });

  it('forwards tint props and runs them through the derived processor', async () => {
    await mountSlider({
      value: 0.2,
      minimumTrackTintColor: '#ff0000',
      maximumTrackTintColor: '#00ff00',
      thumbTintColor: '#0000ff',
    });
    const props = sliderNode().props;
    expect(props.minimumTrackTintColor).toBe('processed(#ff0000)');
    expect(props.maximumTrackTintColor).toBe('processed(#00ff00)');
    expect(props.thumbTintColor).toBe('processed(#0000ff)');
  });

  it('maps both native value rails onto the valueChange output', async () => {
    await mountSlider({ value: 0.2 });
    const node = sliderNode();
    fabric.fireEvent(node.instanceHandle, 'topChange', { value: 0.7 });
    expect(capturedHost?.onValueChange).toHaveBeenCalledWith(0.7);
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderValueChange', { value: 0.42 });
    expect(capturedHost?.onValueChange).toHaveBeenCalledWith(0.42);
  });

  it('maps the direct sliding events onto their outputs', async () => {
    await mountSlider({ value: 0.2 });
    const node = sliderNode();
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingStart', { value: 0.1 });
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingComplete', { value: 0.9 });
    expect(capturedHost?.onSlidingStart).toHaveBeenCalledWith(0.1);
    expect(capturedHost?.onSlidingComplete).toHaveBeenCalledWith(0.9);
  });

  it('maps the direct accessibility-action event onto the accessibilityAction output', async () => {
    await mountSlider({ value: 0.2 });
    const node = sliderNode();
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderAccessibilityAction', {
      actionName: 'increment',
    });
    expect(capturedHost?.onAccessibilityAction).toHaveBeenCalledTimes(1);
  });

  it('resolves disabled from accessibilityState when no explicit boolean', async () => {
    await mountSlider({ value: 0.2, accessibilityState: { disabled: true } });
    expect(sliderNode().props.disabled).toBe(true);
  });

  it('renders the step indicator when renderStepNumber is set', async () => {
    await mountSlider({
      value: 0.5,
      minimumValue: 0,
      maximumValue: 1,
      step: 0.5,
      renderStepNumber: true,
    });
    const container = fabric.find(n => n.props.testID === 'StepsIndicator-Container');
    expect(container, 'a StepsIndicator container is painted').toBeDefined();
  });

  it('does NOT leak a JS callback onto the native node as a prop', async () => {
    await mountSlider({ value: 0.2 });
    expect(typeof sliderNode().props.onValueChange).not.toBe('function');
    expect('valueChange' in sliderNode().props).toBe(false);
  });
});

// Regression test for the anchor/class bug (angular-adapter skill): Slider is its own
// ANCHOR_HOST_COMPONENTS entry (renderer.ts) AND renders through DescriptorOutlet (itself also an
// anchor entry) — a class= on <Slider> resolves onto Slider's OWN anchor, two levels up from the
// real committed centering wrapper View the descriptor builds (see the "paints the raw RNCSlider
// leaf inside a centering wrapper View" test above), and needs its OWN anchorHostStyle merge (see
// shared.ts's `inputProps`). Mirrors the Angular adapter's pressable.test.ts "resolves a class="
// case.
@Component({
  selector: 'symbiote-slider-class-host',
  standalone: true,
  imports: [Slider],
  template: `<Slider class="card" [value]="0.2" />`,
})
class SliderClassHost {}

describe('Angular Slider anchor class= resolution', () => {
  beforeEach(() => {
    fabric.reset();
    registerStyles({ card: { backgroundColor: 'red' } });
  });
  afterEach(() => {
    unmount(ROOT_TAG);
    clearGlobalStyles();
  });

  it('resolves a class= on the Slider use site onto the real committed centering wrapper View', async () => {
    mount(ROOT_TAG, SliderClassHost);
    await tick();

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a real Fabric node carries the class-derived style').toBeDefined();
  });
});
