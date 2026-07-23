// Vue lifecycle wiring over the framework-agnostic Barometer singleton (core/) — mirrors
// the lifecycle-bucket naming convention of adapters/vue/src/composables and the
// onMounted/onUnmounted shape of use-color-scheme.ts's subscription handle. Unlike
// use-hide-animation.ts (which takes a config getter because its consumer's config changes
// across reactive updates), this subscribes exactly once at mount and never needs to react to
// a later change of updateIntervalMs, so a plain numeric param is enough.

import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import { Barometer, type EventSubscription, type IBarometerMeasurement } from '../../../core';

export function useBarometer(updateIntervalMs?: number): Ref<IBarometerMeasurement | null> {
  // A plain ref: the value is a POJO measurement, not an engine node, so no shallowRef needed.
  const measurement = ref<IBarometerMeasurement | null>(null);
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    if (updateIntervalMs !== undefined) {
      Barometer.setUpdateInterval(updateIntervalMs);
    }
    subscription = Barometer.addListener(next => {
      measurement.value = next;
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return measurement;
}
