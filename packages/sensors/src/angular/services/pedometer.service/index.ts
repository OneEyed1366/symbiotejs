import { effect, inject, Injectable, Injector, signal, type Signal } from '@angular/core';
import { watchStepCount, type IPedometerResult } from '../../../core';

// Angular twin of React's `usePedometer` hook and Vue's `usePedometer` composable. Angular has
// no per-instance hook — state and lifecycle live in DI instead, so `connect()` stands in for
// the hook's role: call it ONCE (typically from a component's field initializer, inside an
// injection context).
//
//   readonly result = inject(PedometerService).connect();
//   // template: {{ result()?.steps }}
//
// Unlike AccelerometerService.connect(), there is no updateIntervalMs to apply — Pedometer has
// no setUpdateInterval — so a single effect() that subscribes once and cleans up once is enough.
@Injectable({ providedIn: 'root' })
export class PedometerService {
  // Captured in the constructor (itself always run inside an injection context by Angular's own
  // DI) so `connect()` can create an `effect()` even when called from plain field-initializer
  // code that is not, on its own, an active injection context — mirrors AccelerometerService.
  private readonly injector = inject(Injector);

  connect(): Signal<IPedometerResult | null> {
    const result = signal<IPedometerResult | null>(null);

    effect(
      onCleanup => {
        const subscription = watchStepCount(next => result.set(next));
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return result.asReadonly();
  }
}
