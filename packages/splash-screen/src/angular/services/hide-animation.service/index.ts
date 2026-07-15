import { computed, effect, inject, Injectable, Injector, type Signal } from '@angular/core';
import {
  computeHideAnimationStyles,
  getHideAnimationConstants,
  HideAnimationController,
  type IHideAnimationConfig,
  type IHideAnimationResult,
} from '../../../core';

// Angular twin of React's `useHideAnimation` hook and Vue's `useHideAnimation` composable.
// Angular has no per-instance hook — state and lifecycle live in DI instead, so `connect()`
// stands in for the hook's role: call it ONCE (typically from a component's field initializer,
// inside an injection context) with a GETTER, so it can keep reading the caller's own signals —
// the same reason Vue's composable also takes a getter rather than a value: there is no
// re-render/re-setup cycle here to hang a fresh read off of.
//
//   readonly hideAnimation = inject(HideAnimationService).connect(() => this.config());
//   // template: [style]="hideAnimation().container.style", (layout)="..." etc.
@Injectable({ providedIn: 'root' })
export class HideAnimationService {
  // Captured in the constructor (itself always run inside an injection context by Angular's
  // own DI) so `connect()` can create an `effect()` even when called from plain field-initializer
  // code that is not, on its own, an active injection context — mirrors create-tunnel.ts's
  // `TunnelOut`, which passes its own captured `Injector` to `effect()` for the same reason.
  private readonly injector = inject(Injector);

  connect(getConfig: () => IHideAnimationConfig): Signal<IHideAnimationResult> {
    const controller = new HideAnimationController(getConfig());
    const constants = getHideAnimationConstants();

    effect(() => controller.updateConfig(getConfig()), { injector: this.injector });

    return computed(() => computeHideAnimationStyles(getConfig(), constants, controller));
  }
}
