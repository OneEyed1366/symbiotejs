// useColorScheme, the Vue twin of React's hook. It subscribes a component to the device
// color scheme and updates a reactive ref on change, over the now-core Appearance module
// (@symbiote/engine). Idiomatic Vue: returns a Ref the template unwraps, seeded from the
// current scheme and kept fresh by an Appearance change listener torn down on unmount.
// React's useColorScheme returns the bare value via useSyncExternalStore; the underlying
// Appearance module is shared verbatim; only the lifecycle differs.

import { ref, onMounted, onUnmounted, type Ref } from '@vue/runtime-core';
import { Appearance, type IColorSchemeName, type IEventSubscription } from '@symbiote/engine';

export function useColorScheme(): Ref<IColorSchemeName | null> {
  // A plain ref: the value is a string|null, not an engine node, so no shallowRef needed.
  const colorScheme = ref<IColorSchemeName | null>(Appearance.getColorScheme());
  let subscription: IEventSubscription | undefined;

  onMounted(() => {
    // Re-read on mount in case the scheme changed between setup() and mount.
    colorScheme.value = Appearance.getColorScheme();
    subscription = Appearance.addChangeListener(preferences => {
      colorScheme.value = preferences.colorScheme;
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return colorScheme;
}
