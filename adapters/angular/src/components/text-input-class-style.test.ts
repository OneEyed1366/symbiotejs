// Regression test for the anchor/class bug (angular-adapter skill): TextInput is its own
// ANCHOR_HOST_COMPONENTS entry — a class= on <TextInput> resolves onto TextInput's OWN anchor and
// needs its OWN anchorHostStyle merge (see text-input.ts's buildPassthrough), for BOTH the
// single-line and multiline host it renders through (`@if`/`@else` picks one at runtime). Mirrors
// pressable.test.ts's "resolves a class=" case.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../render';
import { TextInput } from './text-input';

const ROOT_TAG = 917;
const fabric = installFabric();

@Component({
  selector: 'symbiote-text-input-class-host',
  standalone: true,
  imports: [TextInput],
  template: `
    <TextInput [testID]="'single-line'" class="card" />
    <TextInput [testID]="'multiline'" [multiline]="true" class="card" />
  `,
})
class TextInputClassHost {}

beforeEach(() => {
  fabric.reset();
  registerStyles({ card: { backgroundColor: 'red' } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('TextInput anchor class= resolution', () => {
  it('resolves a class= on the TextInput use site onto the real committed single-line host', async () => {
    mount(ROOT_TAG, TextInputClassHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'single-line');
    expect(node?.props.backgroundColor).toBe('red');
  });

  it('resolves a class= on the TextInput use site onto the real committed multiline host', async () => {
    mount(ROOT_TAG, TextInputClassHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'multiline');
    expect(node?.props.backgroundColor).toBe('red');
  });
});
