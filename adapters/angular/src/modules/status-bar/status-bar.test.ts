import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as engine from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { StatusBar } from './index';

const ROOT_TAG = 901;
const fabric = installFabric();

@Component({
  selector: 'symbiote-status-bar-host',
  standalone: true,
  imports: [StatusBar],
  template: ` <StatusBar [barStyle]="'dark-content'" [hidden]="true" [animated]="false" /> `,
})
class StatusBarHost {}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('StatusBar', () => {
  it('applies status bar props on mount and renders no Fabric node', async () => {
    const spy = vi.spyOn(engine, 'applyStatusBarProps').mockReturnValue(undefined);

    mount(ROOT_TAG, StatusBarHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        barStyle: 'dark-content',
        hidden: true,
        animated: false,
      }),
    );

    const root = fabric.appRoot();
    expect(root.children).toHaveLength(0);
  });

  it('exposes imperative statics on the component value', () => {
    expect(typeof StatusBar.setHidden).toBe('function');
    expect(typeof StatusBar.setBarStyle).toBe('function');
    expect(typeof StatusBar.setNetworkActivityIndicatorVisible).toBe('function');
    expect(typeof StatusBar.setBackgroundColor).toBe('function');
    expect(typeof StatusBar.setTranslucent).toBe('function');
  });
});
