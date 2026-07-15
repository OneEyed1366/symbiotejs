// Regression coverage for the anchor-vs-real-content class bug (see pressable.test.ts for the
// full writeup): a `class="..."` written on TouchableNativeFeedback's OWN use site always resolves
// through Angular's addClass/removeClass onto its non-painting ANCHOR host, never onto the real
// committed feedback <symbiote-view> one level down. TouchableNativeFeedback has no explicit
// `style`/`class`-forwarding @Input() of its own, so the anchor's class-derived style is the
// ONLY style source hostProps.style forwards.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { TouchableNativeFeedback } from './index';

const ROOT_TAG = 941;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

@Component({
  selector: 'symbiote-touchable-native-feedback-host',
  standalone: true,
  imports: [TouchableNativeFeedback],
  template: `
    <TouchableNativeFeedback [testID]="'native-feedback'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableNativeFeedback>
  `,
})
class TouchableNativeFeedbackHost {}

describe('TouchableNativeFeedback', () => {
  it('resolves a class= on the TouchableNativeFeedback use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableNativeFeedbackHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'native-feedback');
    expect(node?.props.backgroundColor).toBe('red');
  });
});
