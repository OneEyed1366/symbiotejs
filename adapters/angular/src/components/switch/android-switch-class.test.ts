// Android-specific twin of the class= regression covered for iOS in switch.test.ts. Switch's
// hostProps getter is overridden per-platform component (index.ios.ts / index.android.ts), each
// injecting its OWN ElementRef, so the fix needs its own coverage against the Android build too.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { Switch } from './index.android';

const ROOT_TAG = 942;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

@Component({
  selector: 'symbiote-android-switch-class-host',
  standalone: true,
  imports: [Switch],
  template: `<Switch [testID]="'switch-with-class'" class="card"></Switch>`,
})
class AndroidSwitchClassHost {}

describe('Switch (android)', () => {
  it('resolves a class= on the Switch use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, AndroidSwitchClassHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'switch-with-class');
    expect(node?.props.backgroundColor).toBe('red');
  });
});
