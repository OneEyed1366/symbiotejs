import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { Pressable } from './index';

const ROOT_TAG = 903;
const fabric = installFabric();

let capturedHost: PressableHost | undefined;

@Component({
  selector: 'symbiote-pressable-host',
  standalone: true,
  imports: [Pressable],
  template: `
    <Pressable
      [testID]="'pressable'"
      class="card"
      (press)="onPress($event)"
      (pressIn)="onPressIn($event)"
      (pressOut)="onPressOut($event)"
    >
      <symbiote-text>Press me</symbiote-text>
    </Pressable>
  `,
})
class PressableHost {
  onPress = vi.fn();
  onPressIn = vi.fn();
  onPressOut = vi.fn();

  constructor() {
    // Captures the live component instance so the test can drive its signals after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  capturedHost = undefined;
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('Pressable', () => {
  it('synthesizes a press from a touch sequence and fires the lifecycle handlers', async () => {
    mount(ROOT_TAG, PressableHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'pressable');
    expect(node, 'Pressable view committed').toBeDefined();

    const now = Date.now();
    const touch = { identifier: 1, pageX: 10, pageY: 10, timestamp: now };
    const nativeEvent = { touches: [touch], changedTouches: [touch] };

    fabric.fireEvent(node?.instanceHandle, 'topTouchStart', nativeEvent);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(capturedHost?.onPressIn).toHaveBeenCalledOnce();

    fabric.fireEvent(node?.instanceHandle, 'topTouchEnd', nativeEvent);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(capturedHost?.onPress).toHaveBeenCalledOnce();
    expect(capturedHost?.onPressOut).toHaveBeenCalledOnce();
  });

  it('resolves a class= on the Pressable use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, PressableHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'pressable');
    expect(node?.props.backgroundColor).toBe('red');
  });
});
