// StatusBar, the Angular lifecycle half. The native StatusBarManager driving, the imperative
// statics, and the Android bar-height constant all live in @symbiote-native/engine, shared verbatim with
// React and Vue; Metro selects the engine's platform variant. Angular supplies only the
// declarative shape: a component that renders nothing and re-applies the props through
// ngOnChanges on mount + every prop change. Imperative statics are attached to the component
// object the same way RN does.

import { Component, Input, type OnChanges, type SimpleChanges } from '@angular/core';
import {
  applyStatusBarProps,
  statusBarImperative,
  statusBarCurrentHeight,
  type IColorValue,
  type IStatusBarProps,
  type IStatusBarStyle,
} from '@symbiote-native/engine';

export type { IStatusBarProps, IStatusBarStyle } from '@symbiote-native/engine';

@Component({
  selector: 'StatusBar',
  standalone: true,
  template: '',
})
class StatusBarComponent implements OnChanges {
  @Input() barStyle?: IStatusBarStyle;
  @Input() hidden?: boolean;
  @Input() animated?: boolean;
  @Input() networkActivityIndicatorVisible?: boolean;
  @Input() backgroundColor?: IColorValue;
  @Input() translucent?: boolean;

  ngOnChanges(_changes: SimpleChanges): void {
    applyStatusBarProps(this.buildProps());
  }

  private buildProps(): IStatusBarProps {
    return {
      barStyle: this.barStyle,
      hidden: this.hidden,
      animated: this.animated,
      networkActivityIndicatorVisible: this.networkActivityIndicatorVisible,
      backgroundColor: this.backgroundColor,
      translucent: this.translucent,
    };
  }
}

const StatusBarWithStatics = Object.assign(StatusBarComponent, statusBarImperative);

Object.defineProperty(StatusBarWithStatics, 'currentHeight', {
  get: statusBarCurrentHeight,
  enumerable: true,
});

export const StatusBar: typeof StatusBarWithStatics & { readonly currentHeight?: number } =
  StatusBarWithStatics;
