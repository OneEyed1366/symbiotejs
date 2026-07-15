import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { KeyboardAvoidingView } from './index';

const ROOT_TAG = 911;
const fabric = installFabric();

// KeyboardAvoidingView's ngOnInit subscribes to the Keyboard module, which installs the
// bridgeless device-event hub on first use — needs a fake RN$registerCallableModule so
// installDeviceEventHub() doesn't throw (core/engine/src/native-events.ts). No native event is
// actually emitted in this test, only the subscribe/unsubscribe lifecycle runs.
Object.assign(globalThis, {
  RN$registerCallableModule: (
    _name: string,
    _factory: () => { emit: (eventType: string, ...args: unknown[]) => void },
  ): void => {},
});

@Component({
  selector: 'symbiote-kav-host',
  standalone: true,
  imports: [KeyboardAvoidingView],
  template: `
    <KeyboardAvoidingView [testID]="'kav'" class="panel">
      <symbiote-text>Hello</symbiote-text>
    </KeyboardAvoidingView>
  `,
})
class KeyboardAvoidingViewHostFixture {}

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('KeyboardAvoidingView', () => {
  it('resolves a class= on the KeyboardAvoidingView use site onto the real committed view, not the anchor', async () => {
    registerStyles({ panel: { backgroundColor: 'teal' } });

    mount(ROOT_TAG, KeyboardAvoidingViewHostFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'kav');
    expect(node?.props.backgroundColor).toBe('teal');
  });
});
