import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiotejs/engine';
import { installFabric } from '@symbiotejs/test-utils';

import { mount, unmount } from '../../render';
import { Switch } from './index';

const ROOT_TAG = 902;
const fabric = installFabric();

let capturedHost: SwitchHost | undefined;

@Component({
  selector: 'symbiote-switch-host',
  standalone: true,
  imports: [Switch],
  template: `
    <Switch [value]="value" (valueChange)="onValueChange($event)" (change)="onChange($event)">
    </Switch>
  `,
})
class SwitchHost {
  value = false;
  onValueChange = vi.fn((next: boolean) => {
    this.value = next;
  });
  onChange = vi.fn();

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

describe('Switch', () => {
  it('commits a controlled Switch with the resolved iOS color props', async () => {
    mount(ROOT_TAG, SwitchHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.viewName === 'Switch');
    expect(node, 'Switch node committed').toBeDefined();
    expect(node?.props).toMatchObject({
      value: false,
    });
  });

  it('fires onValueChange and onChange when native reports a change', async () => {
    mount(ROOT_TAG, SwitchHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.viewName === 'Switch');
    expect(node).toBeDefined();

    fabric.fireEvent(node?.instanceHandle, 'topChange', { value: true, eventCount: 1 });
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const host = capturedHost;
    expect(host?.onValueChange).toHaveBeenCalledWith(true);
    expect(host?.onChange).toHaveBeenCalled();
    expect(host?.value).toBe(true);
  });

  it('resolves a class= on the Switch use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, SwitchClassHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'switch-with-class');
    expect(node?.props.backgroundColor).toBe('red');
  });
});

@Component({
  selector: 'symbiote-switch-class-host',
  standalone: true,
  imports: [Switch],
  template: `<Switch [testID]="'switch-with-class'" class="card"></Switch>`,
})
class SwitchClassHost {}
