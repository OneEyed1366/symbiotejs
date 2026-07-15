// Regression coverage for the anchor-vs-real-content class bug (see pressable.test.ts for the
// full writeup): a `class="..."` written on a composed component's OWN use site always resolves
// through Angular's addClass/removeClass onto that component's non-painting ANCHOR host, never
// onto the real committed Fabric view one (or more) levels down. Each Touchable forwards its own
// anchor's resolved style into whatever it commits, mirroring Pressable's fix.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { TouchableHighlight, TouchableOpacity, TouchableWithoutFeedback } from './index';

const ROOT_TAG = 940;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

@Component({
  selector: 'symbiote-touchable-opacity-host',
  standalone: true,
  imports: [TouchableOpacity],
  template: `
    <TouchableOpacity [testID]="'opacity'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableOpacity>
  `,
})
class TouchableOpacityHost {}

@Component({
  selector: 'symbiote-touchable-highlight-host',
  standalone: true,
  imports: [TouchableHighlight],
  template: `
    <TouchableHighlight [testID]="'highlight'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableHighlight>
  `,
})
class TouchableHighlightHost {}

@Component({
  selector: 'symbiote-touchable-without-feedback-host',
  standalone: true,
  imports: [TouchableWithoutFeedback],
  template: `
    <TouchableWithoutFeedback [testID]="'without-feedback'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableWithoutFeedback>
  `,
})
class TouchableWithoutFeedbackHost {}

describe('TouchableOpacity', () => {
  it('resolves a class= on the TouchableOpacity use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableOpacityHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // TouchableOpacity folds its OWN class-derived style into the inner AnimatedView leaf, not
    // the outer Pressable — mirroring React's TouchableOpacity (see adapters/react/src/components/
    // touchable/index.ts's comment: "className is pulled out here, like style, and applied to the
    // inner AnimatedView... it would land on the outer Pressable instead, which is not what a user
    // expects"), so the testID-carrying outer view is NOT where the resolved style lands.
    expect(fabric.find(n => n.props.testID === 'opacity')).toBeDefined();
    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a committed node received the class-derived style').toBeDefined();
  });
});

describe('TouchableHighlight', () => {
  it('resolves a class= on the TouchableHighlight use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableHighlightHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'highlight');
    expect(node?.props.backgroundColor).toBe('red');
  });
});

describe('TouchableWithoutFeedback', () => {
  it('resolves a class= on the TouchableWithoutFeedback use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableWithoutFeedbackHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'without-feedback');
    expect(node?.props.backgroundColor).toBe('red');
  });
});
