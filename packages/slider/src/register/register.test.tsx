// Regression test for the package-level RNCSlider fallback registration. The app/examples still
// inject RN's ReactNativeViewConfigRegistry when available, but @symbiote-native/slider must be self-
// contained: importing this package registers RNCSlider's events + tint processors even when the
// registry lookup misses on a real host.

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/react';
import { setColorProcessor, type ISymbioteEvent } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import './index';

vi.mock('@react-native-community/slider/dist/RNCSliderNativeComponent', () => ({}));

const ROOT_TAG = 313;
const SLIDER_VIEW = 'RNCSlider';

const fabric = installFabric();

function sliderNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SLIDER_VIEW);
  if (!node) throw new Error(`no ${SLIDER_VIEW} was created`);
  return node;
}

function numberFromEvent(event: ISymbioteEvent): number | undefined {
  const value = event.nativeEvent.value;
  return typeof value === 'number' ? value : undefined;
}

beforeEach(() => {
  fabric.reset();
  setNativeViewConfigSource(() => undefined);
  setColorProcessor(value => `processed(${String(value)})`);
});

afterEach(() => {
  unmount(ROOT_TAG);
  setColorProcessor(value => value);
});

describe('RNCSlider package registration', () => {
  it('processes slider tint colors without RN ViewConfig registry metadata', () => {
    mount(
      ROOT_TAG,
      createElement('RNCSlider', {
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

  it('routes slider native value events without RN ViewConfig registry metadata', () => {
    let changed: number | undefined;
    const onChange = (event: ISymbioteEvent): void => {
      changed = numberFromEvent(event);
    };

    mount(ROOT_TAG, createElement('RNCSlider', { onChange, onRNCSliderValueChange: onChange }));

    const node = sliderNode();
    fabric.fireEvent(node.instanceHandle, 'topChange', { value: 0.25 });
    expect(changed).toBe(0.25);
    fabric.fireEvent(node.instanceHandle, 'topRNCSliderValueChange', { value: 0.75 });
    expect(changed).toBe(0.75);
  });

  it('routes slider direct events without RN ViewConfig registry metadata', () => {
    let completedAt: number | undefined;

    mount(
      ROOT_TAG,
      createElement('RNCSlider', {
        onRNCSliderSlidingComplete: (event: ISymbioteEvent): void => {
          completedAt = numberFromEvent(event);
        },
      }),
    );

    fabric.fireEvent(sliderNode().instanceHandle, 'topRNCSliderSlidingComplete', { value: 0.5 });
    expect(completedAt).toBe(0.5);
  });
});
