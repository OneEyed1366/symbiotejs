// Co-located React-driven test (ADR 0025) for the @symbiotejs/slider React wrapper. Mirrors the Vue
// wrapper test against the SAME injected codegen-shaped ViewConfig, proving the shared core drives
// React identically: the native RNCSlider leaf paints inside the centering View, value/disabled/
// limits fold faithfully to the library, tints process, and the native value/sliding events map
// onto onValueChange / onSlidingStart / onSlidingComplete. Slider is imported from '.' (NOT the
// package barrel) so the third-party native-spec side-effect (../register) never loads headless.

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiotejs/react';
import { installFabric, type IFakeNode } from '@symbiotejs/test-utils';
import { Slider } from '.';

const ROOT_TAG = 312;
const SLIDER_VIEW = 'RNCSlider';

const fakeColor = (value: unknown): string => `processed(${value})`;

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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function findInTree(
  predicate: (node: IFakeNode) => boolean,
  nodes = fabric.committed,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const child = findInTree(predicate, node.children);
    if (child) return child;
  }
  return undefined;
}

function sliderNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no ${SLIDER_VIEW} was created`);
  return node;
}

function currentSliderNode(): IFakeNode {
  const node = findInTree(n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no committed ${SLIDER_VIEW} exists`);
  return node;
}

function sliderWrapperNode(): IFakeNode {
  const node = findInTree(
    n => n.viewName === 'RCTView' && n.children.some(child => child.viewName === SLIDER_VIEW),
  );
  if (!node) throw new Error('no committed Slider wrapper exists');
  return node;
}

describe('React Slider wrapper', () => {
  it('paints the raw RNCSlider leaf inside a centering wrapper View', () => {
    mount(
      ROOT_TAG,
      createElement(Slider, { value: 0.5, minimumValue: 0, maximumValue: 1, step: 0.1 }),
    );
    const props = sliderNode().props;
    expect(props.value).toBe(0.5);
    expect(props.minimumValue).toBe(0);
    expect(props.maximumValue).toBe(1);
    expect(props.step).toBe(0.1);
    expect(fabric.find(n => n.viewName === 'RCTView')).toBeDefined();
  });

  it('defaults range + limits the way the library wrapper does', () => {
    mount(ROOT_TAG, createElement(Slider, { value: 0.3 }));
    const props = sliderNode().props;
    expect(props.minimumValue).toBe(0);
    expect(props.maximumValue).toBe(1);
    expect(props.step).toBe(0);
    expect(props.lowerLimit).toBe(Number.MIN_SAFE_INTEGER);
    expect(props.upperLimit).toBe(Number.MAX_SAFE_INTEGER);
    expect(props.inverted).toBe(false);
    expect(props.disabled).toBe(false);
  });

  it('sanitizes a falsy/NaN value to undefined (library passedValue quirk)', () => {
    mount(ROOT_TAG, createElement(Slider, { value: 0 }));
    expect(sliderNode().props.value).toBeUndefined();
    unmount(ROOT_TAG);
    fabric.reset();
    mount(ROOT_TAG, createElement(Slider, { value: Number.NaN }));
    expect(sliderNode().props.value).toBeUndefined();
  });

  it('measures the wrapper and pins the native slider width in the common non-steps path', async () => {
    mount(ROOT_TAG, createElement(Slider, { value: 0.5 }));
    fabric.fireEvent(sliderWrapperNode().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 240, height: 40 },
    });
    await tick();
    expect(currentSliderNode().props.width).toBe(240);
  });

  it('forwards tint props and runs them through the derived processor', () => {
    mount(
      ROOT_TAG,
      createElement(Slider, {
        value: 0.2,
        minimumTrackTintColor: '#ff0000',
        maximumTrackTintColor: '#00ff00',
        thumbTintColor: '#0000ff',
      }),
    );
    const props = sliderNode().props;
    expect(props.minimumTrackTintColor).toBe('processed(#ff0000)');
    expect(props.maximumTrackTintColor).toBe('processed(#00ff00)');
    expect(props.thumbTintColor).toBe('processed(#0000ff)');
  });

  it('maps both native value rails onto onValueChange(value)', () => {
    let changed: number | undefined;
    mount(
      ROOT_TAG,
      createElement(Slider, { value: 0.2, onValueChange: (v: number) => (changed = v) }),
    );
    const node = sliderNode();
    fabric.fireEvent(node.instanceHandle, 'topChange', { value: 0.7 });
    expect(changed).toBe(0.7);
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderValueChange', { value: 0.42 });
    expect(changed).toBe(0.42);
  });

  it('maps the direct sliding events onto their callbacks', () => {
    let startedAt: number | undefined;
    let completedAt: number | undefined;
    mount(
      ROOT_TAG,
      createElement(Slider, {
        value: 0.2,
        onSlidingStart: (v: number) => (startedAt = v),
        onSlidingComplete: (v: number) => (completedAt = v),
      }),
    );
    const node = sliderNode();
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingStart', { value: 0.1 });
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderSlidingComplete', { value: 0.9 });
    expect(startedAt).toBe(0.1);
    expect(completedAt).toBe(0.9);
  });

  it('resolves disabled from accessibilityState when no explicit boolean', () => {
    mount(ROOT_TAG, createElement(Slider, { value: 0.2, accessibilityState: { disabled: true } }));
    expect(sliderNode().props.disabled).toBe(true);
  });

  it('renders the step indicator when renderStepNumber is set', () => {
    mount(
      ROOT_TAG,
      createElement(Slider, {
        value: 0.5,
        minimumValue: 0,
        maximumValue: 1,
        step: 0.5,
        renderStepNumber: true,
      }),
    );
    expect(fabric.find(n => n.props.testID === 'StepsIndicator-Container')).toBeDefined();
  });

  it('does NOT leak the JS onValueChange callback to the native node as a prop', () => {
    mount(ROOT_TAG, createElement(Slider, { value: 0.2, onValueChange: () => undefined }));
    expect(typeof sliderNode().props.onValueChange).not.toBe('function');
  });
});
