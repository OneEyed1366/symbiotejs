// Vue lifecycle wiring over the framework-agnostic watchStepCount free function (core/) —
// mirrors the lifecycle-bucket naming convention of adapters/vue/src/composables and the
// onMounted/onUnmounted shape of useAccelerometer. Pedometer has no setUpdateInterval, so
// unlike useAccelerometer there is no interval param to apply at subscribe time.

import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import { watchStepCount, type EventSubscription, type IPedometerResult } from '../../../core';

export function usePedometer(): Ref<IPedometerResult | null> {
  // A plain ref: the value is a POJO result, not an engine node, so no shallowRef needed.
  const result = ref<IPedometerResult | null>(null);
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    subscription = watchStepCount(next => {
      result.value = next;
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return result;
}
