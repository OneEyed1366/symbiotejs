// Co-located React-driven pipeline test (ADR 0025), ported from the headless
// `touchable-native-feedback.smoke`. Proves TouchableNativeFeedback: the pure static
// factories (SelectableBackground / Ripple), that the native ripple drawable lands on
// the underlying Pressable's committed node, that a press round-trips through that
// Pressable, and that a missing background defaults to SelectableBackground. Android-only
// feature; on iOS the native prop is inert but still committed (exactly what we assert).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, TouchableNativeFeedback, mount, unmount } from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

const ROOT_TAG = 130;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// The responder is the Pressable's own RCTView, the first non-box-none RCTView created.
function responderHandle(): unknown {
  const view = fabric.find(n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none');
  if (!view) throw new Error('no RCTView (Pressable responder) was created');
  return view.instanceHandle;
}

// The feedback View carries the native ripple drawable.
function feedbackProps(): Record<string, unknown> {
  const node: IFakeNode | undefined = fabric.find(
    n =>
      n.props.nativeBackgroundAndroid !== undefined ||
      n.props.nativeForegroundAndroid !== undefined,
  );
  if (!node) throw new Error('no node carried a native background/foreground');
  return node.props;
}

describe('React TouchableNativeFeedback', () => {
  it('builds the right config dicts from the static factories', () => {
    const sel = TouchableNativeFeedback.SelectableBackground();
    expect(sel.type).toBe('ThemeAttrAndroid');
    expect(sel.attribute).toBe('selectableItemBackground');

    expect(TouchableNativeFeedback.SelectableBackground(12).rippleRadius).toBe(12);
    expect(TouchableNativeFeedback.SelectableBackgroundBorderless().attribute).toBe(
      'selectableItemBackgroundBorderless',
    );

    const ripple = TouchableNativeFeedback.Ripple('#fff', true);
    expect(ripple.type).toBe('RippleAndroid');
    expect(ripple.color).toBe('#fff');
    expect(ripple.borderless).toBe(true);
  });

  it('lands the ripple background on the committed node as nativeBackgroundAndroid', () => {
    mount(
      ROOT_TAG,
      <TouchableNativeFeedback background={TouchableNativeFeedback.Ripple('#00f', false)}>
        <View />
      </TouchableNativeFeedback>,
    );
    const props = feedbackProps();
    const bg = props.nativeBackgroundAndroid;
    expect(isRecord(bg) && bg.type === 'RippleAndroid' && bg.color === '#00f').toBe(true);
    // without useForeground the foreground prop must be absent.
    expect(props.nativeForegroundAndroid).toBeUndefined();
  });

  it('fires onPress through the underlying Pressable', () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      <TouchableNativeFeedback
        onPress={() => {
          presses++;
        }}
      >
        <View />
      </TouchableNativeFeedback>,
    );
    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    expect(presses).toBe(1);
  });

  it('defaults a missing background to SelectableBackground', () => {
    mount(
      ROOT_TAG,
      <TouchableNativeFeedback>
        <View />
      </TouchableNativeFeedback>,
    );
    const bg = feedbackProps().nativeBackgroundAndroid;
    expect(isRecord(bg) && bg.attribute === 'selectableItemBackground').toBe(true);
  });
});
