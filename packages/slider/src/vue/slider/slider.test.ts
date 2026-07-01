// Co-located Vue-driven test (ADR 0025) for the @symbiote/slider Vue wrapper. The native RNCSlider
// carries no symbiote metadata — the engine DERIVES its events + tint processors from an injected
// codegen-shaped ViewConfig (the same shape the React adapter's slider.test injects, the same shape
// RN's ReactNativeViewConfigRegistry holds on a real host). We import the Slider component from '.'
// (NOT the package barrel) so the third-party native-spec side-effect (../register) never loads
// headless. Proves: the wrapper paints the raw RNCSlider leaf inside its centering View, folds
// value/disabled/limits faithfully to the library, forwards + processes the tints, and maps the
// native value/sliding events onto onValueChange / onSlidingStart / onSlidingComplete.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote/vue';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';
import { Slider } from '.';

const ROOT_TAG = 311;
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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function sliderNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no ${SLIDER_VIEW} was created`);
  return node;
}

async function mountSlider(props: Record<string, unknown>): Promise<void> {
  mount(ROOT_TAG, defineComponent({ setup: () => () => h(Slider, props) }));
  await tick();
}

describe('Vue Slider wrapper', () => {
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

  it('maps both native value rails onto onValueChange(value)', async () => {
    let changed: number | undefined;
    await mountSlider({ value: 0.2, onValueChange: (value: number) => (changed = value) });
    const node = sliderNode();
    fabric.fireEvent(node.instanceHandle, 'topChange', { value: 0.7 });
    expect(changed).toBe(0.7);
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderValueChange', { value: 0.42 });
    expect(changed).toBe(0.42);
  });

  it('maps the direct sliding events onto their callbacks', async () => {
    let startedAt: number | undefined;
    let completedAt: number | undefined;
    await mountSlider({
      value: 0.2,
      onSlidingStart: (value: number) => (startedAt = value),
      onSlidingComplete: (value: number) => (completedAt = value),
    });
    const node = sliderNode();
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingStart', { value: 0.1 });
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingComplete', { value: 0.9 });
    expect(startedAt).toBe(0.1);
    expect(completedAt).toBe(0.9);
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

  it('does NOT leak the JS onValueChange callback to the native node as a prop', async () => {
    await mountSlider({ value: 0.2, onValueChange: () => undefined });
    expect(typeof sliderNode().props.onValueChange).not.toBe('function');
  });

  it('accepts modelValue as an alias for value, never forwarding it to the native node', async () => {
    await mountSlider({ modelValue: 0.6 });
    const props = sliderNode().props;
    expect(props.value).toBe(0.6);
    expect('modelValue' in props, 'modelValue must not reach Fabric').toBe(false);
  });

  it('emits update:modelValue and update:value alongside valueChange', async () => {
    let modelValueUpdate: number | undefined;
    let valueUpdate: number | undefined;
    await mountSlider({
      modelValue: 0.2,
      'onUpdate:modelValue': (value: number) => (modelValueUpdate = value),
      'onUpdate:value': (value: number) => (valueUpdate = value),
    });
    fabric.fireEvent(sliderNode().instanceHandle, 'topChange', { value: 0.7 });
    expect(modelValueUpdate).toBe(0.7);
    expect(valueUpdate).toBe(0.7);
  });
});
