import { effect, inject, Injectable, Injector, signal, type Signal } from '@angular/core';
import { Barometer, type IBarometerMeasurement } from '../../../core';

// Angular twin of React's `useBarometer` hook and Vue's `useBarometer` composable.
// Angular has no per-instance hook — state and lifecycle live in DI instead, so `connect()`
// stands in for the hook's role: call it ONCE (typically from a component's field initializer,
// inside an injection context).
//
//   readonly measurement = inject(BarometerService).connect();
//   // template: {{ measurement()?.pressure }}
//
// Unlike HideAnimationService.connect(), there is no per-render config to re-sync — the
// subscription doesn't depend on anything the caller's own signals could change between
// renders — so a single effect() that subscribes once and cleans up once is enough; no
// `updateConfig`-style effect that re-runs on every read is needed here.
@Injectable({ providedIn: 'root' })
export class BarometerService {
  // Captured in the constructor (itself always run inside an injection context by Angular's
  // own DI) so `connect()` can create an `effect()` even when called from plain field-initializer
  // code that is not, on its own, an active injection context — mirrors HideAnimationService.
  private readonly injector = inject(Injector);

  connect(updateIntervalMs?: number): Signal<IBarometerMeasurement | null> {
    const measurement = signal<IBarometerMeasurement | null>(null);

    effect(
      onCleanup => {
        if (updateIntervalMs !== undefined) {
          Barometer.setUpdateInterval(updateIntervalMs);
        }
        const subscription = Barometer.addListener(next => measurement.set(next));
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return measurement.asReadonly();
  }
}
