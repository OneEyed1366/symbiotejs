// useLinkingIntegration: wires the framework-agnostic linking config (../core's
// resolveRouteFromUrl) onto an existing Stack's INavigatorHandle. Deliberately NOT called from
// inside stack.ts - app code owns the wiring, the same top-level-prop shape @react-navigation
// keeps `linking` in on NavigationContainer rather than baking it into the router itself.
//
// Vue-shape difference from React: React's twin takes the RESOLVED `navigatorHandle:
// INavigatorHandle` directly, because a React hook is called fresh on EVERY render with the
// caller's current value, and useImperativeHandle's ref assignment (a layout effect) is
// guaranteed to run before this hook's OWN mount effect, so `handleRef.current` is already
// populated by the time it's read. Vue's setup() runs exactly ONCE per component instance, so
// there is no "fresh call every render" to re-supply a resolved value, and a template/h() `ref`
// only resolves to Stack's expose()d handle AFTER mount - an eagerly-resolved argument evaluated
// at composable-call time (during setup, before mount) would be null. This composable therefore
// takes the Stack's `Ref<INavigatorHandle | null>` itself (the ref object, not its resolved
// value) and reads `.value` lazily inside onMounted - Vue's own onMounted hooks fire bottom-up
// (children before parents), giving the same "already populated" guarantee React's layout-effect
// ordering does.

import { onMounted, onUnmounted } from '@vue/runtime-core';
import type { Ref } from '@vue/runtime-core';
import { Linking, dlog } from '@symbiote-native/engine';
import type { IEventSubscription, IUrlEvent } from '@symbiote-native/engine';
import { resolveRouteFromUrl } from '../core';
import type { ILinkingConfig, INavigatorHandle } from '../core';

export function useLinkingIntegration(
  config: ILinkingConfig,
  navigatorHandle: Ref<INavigatorHandle | null>,
): void {
  let cancelled = false;
  let subscription: IEventSubscription | undefined;

  function applyRoute(url: string, dispatch: (name: string, params?: unknown) => void): void {
    const route = resolveRouteFromUrl(config, url);
    if (route === null) {
      dlog(`useLinkingIntegration: no route resolved for "${url}"`);
      return;
    }
    dispatch(route.name, route.params);
  }

  onMounted(() => {
    const handle = navigatorHandle.value;
    if (handle === null) {
      dlog('useLinkingIntegration: navigatorHandle is not yet available at mount time');
      return;
    }

    Linking.getInitialURL()
      .then(url => {
        if (cancelled || url === null) return;
        dlog(`useLinkingIntegration: initial URL "${url}"`);
        applyRoute(url, handle.replace);
      })
      .catch((error: unknown) => {
        dlog(`useLinkingIntegration: getInitialURL failed: ${String(error)}`);
      });

    subscription = Linking.addEventListener('url', (event: IUrlEvent) => {
      dlog(`useLinkingIntegration: url event "${event.url}"`);
      applyRoute(event.url, handle.push);
    });
  });

  onUnmounted(() => {
    cancelled = true;
    subscription?.remove();
  });
}
