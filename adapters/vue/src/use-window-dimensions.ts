// useWindowDimensions, the Vue twin of React's hook, over the now-core Dimensions module
// (@symbiote/engine). It seeds from Dimensions.get('window'), subscribes to 'change', and
// re-checks once after subscribing to close the gap between the setup-time get and the
// mount-time listener. Only a real window-metric change updates the ref. React returns the
// bare value via useState; the underlying Dimensions module is shared verbatim; only the
// lifecycle differs (returns a Ref the template unwraps).

import { ref, onMounted, onUnmounted, type Ref } from '@vue/runtime-core';
import {
  Dimensions,
  type IDimensionsSet,
  type IDisplayMetrics,
  type IEventSubscription,
} from '@symbiote/engine';

export function useWindowDimensions(): Ref<IDisplayMetrics> {
  // A plain ref: the value is a metrics record (plain data), not an engine node.
  const dimensions = ref<IDisplayMetrics>(Dimensions.get('window'));
  let subscription: IEventSubscription | undefined;

  onMounted(() => {
    const handleChange = (window: IDisplayMetrics): void => {
      const current = dimensions.value;
      if (
        current.width !== window.width ||
        current.height !== window.height ||
        current.scale !== window.scale ||
        current.fontScale !== window.fontScale
      ) {
        dimensions.value = window;
      }
    };

    subscription = Dimensions.addEventListener('change', (set: IDimensionsSet) => {
      handleChange(set.window);
    });
    // We may have missed an update between the setup-time `get` and subscribing here;
    // re-check now. If nothing changed, the equality guard filters the no-op.
    handleChange(Dimensions.get('window'));
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return dimensions;
}
