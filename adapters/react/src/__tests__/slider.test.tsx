// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `slider.smoke`. Proves derive-by-default for a THIRD-PARTY native view exercised
// through the RAW Fabric name with NO symbiote wrapper (the way a library's codegen
// reaches us: it resolves to the string 'RNCSlider'). The engine is told nothing about
// the slider; it DERIVES everything from an injected codegen-shaped ViewConfig: plain
// props pass through, tint props run the validAttributes[*].process processor, and both
// bubbling and direct events dispatch to their handlers. No simulator.

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiotejs/react';
import { type ISymbioteEvent } from '@symbiotejs/engine';
import { installFabric, type IFakeNode } from '@symbiotejs/test-utils';

const ROOT_TAG = 200;
const SLIDER_VIEW = 'RNCSlider';

// The codegen-shaped config the engine DERIVES from (on a real host this is RN's
// ReactNativeViewConfigRegistry.get, populated by the library's codegen).
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
  },
  validAttributes: {
    value: true,
    minimumValue: true,
    maximumValue: true,
    step: true,
    minimumTrackTintColor: { process: fakeColor },
    maximumTrackTintColor: { process: fakeColor },
    thumbTintColor: { process: fakeColor },
  },
};

const fabric = installFabric();
setNativeViewConfigSource(name => (name === SLIDER_VIEW ? RNC_SLIDER_VIEW_CONFIG : undefined));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function sliderNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no ${SLIDER_VIEW} was created`);
  return node;
}

function numberFromEvent(event: ISymbioteEvent): number | undefined {
  const value = event.nativeEvent.value;
  return typeof value === 'number' ? value : undefined;
}

describe('React-driven derived RNCSlider', () => {
  it('renders the raw RNCSlider and passes plain props through', () => {
    mount(
      ROOT_TAG,
      createElement('RNCSlider', { value: 0.5, minimumValue: 0, maximumValue: 1, step: 0.1 }),
    );
    const props = sliderNode().props;
    expect(props.value).toBe(0.5);
    expect(props.minimumValue).toBe(0);
    expect(props.maximumValue).toBe(1);
    expect(props.step).toBe(0.1);
  });

  it('runs tint props through the derived processor', () => {
    mount(
      ROOT_TAG,
      createElement('RNCSlider', {
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

  it('dispatches derived bubbling events to their handler', () => {
    let changed: number | undefined;
    const onChange = (event: ISymbioteEvent): void => {
      changed = numberFromEvent(event);
    };
    mount(
      ROOT_TAG,
      createElement('RNCSlider', { value: 0.2, onChange, onRNCSliderValueChange: onChange }),
    );
    const node = sliderNode();
    fabric.fireEvent(node.instanceHandle, 'topChange', { value: 0.7 });
    expect(changed).toBe(0.7);
    // The other value rail, derived from bubblingEventTypes, must reach the same handler.
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderValueChange', { value: 0.42 });
    expect(changed).toBe(0.42);
  });

  it('dispatches a derived direct event (slidingComplete) to its handler', () => {
    let completedAt: number | undefined;
    mount(
      ROOT_TAG,
      createElement('RNCSlider', {
        value: 0.2,
        onRNCSliderSlidingComplete: (event: ISymbioteEvent): void => {
          completedAt = numberFromEvent(event);
        },
      }),
    );
    fabric.fireEvent(sliderNode().instanceHandle, 'topRNCSliderSlidingComplete', { value: 0.9 });
    expect(completedAt).toBe(0.9);
  });
});
