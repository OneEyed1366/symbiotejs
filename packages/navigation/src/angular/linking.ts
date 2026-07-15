// injectLinkingIntegration: wires the framework-agnostic linking config (../core's
// resolveRouteFromUrl) onto an existing Stack's INavigatorHandle. Deliberately NOT called from
// inside stack.ts - app code owns the wiring (call this from the component hosting `<Stack #nav>`,
// passing `nav` itself, since Stack now implements INavigatorHandle directly), the same
// top-level-prop shape @react-navigation keeps `linking` in on NavigationContainer rather than
// baking it into the router itself. Mirrors react/linking.ts's useLinkingIntegration; Angular
// needs none of its `configRef`/`handleRef` staleness workaround - this function runs its
// subscription ONCE per call (the natural `inject()` call-site convention), and Stack's methods
// already read live `this` state off the component instance, so there is no stale-closure risk to
// guard against here.

import { DestroyRef, inject } from '@angular/core';
import { Linking, dlog } from '@symbiote-native/engine';
import type { IUrlEvent } from '@symbiote-native/engine';
import { resolveRouteFromUrl } from '../core';
import type { ILinkingConfig } from '../core';
import type { INavigatorHandle } from './stack';

export function injectLinkingIntegration(
  config: ILinkingConfig,
  navigatorHandle: INavigatorHandle,
): void {
  const destroyRef = inject(DestroyRef);

  function applyRoute(url: string, dispatch: (name: string, params?: unknown) => void): void {
    const route = resolveRouteFromUrl(config, url);
    if (route === null) {
      dlog(`injectLinkingIntegration: no route resolved for "${url}"`);
      return;
    }
    dispatch(route.name, route.params);
  }

  let cancelled = false;

  Linking.getInitialURL()
    .then(url => {
      if (cancelled || url === null) return;
      dlog(`injectLinkingIntegration: initial URL "${url}"`);
      applyRoute(url, navigatorHandle.replace);
    })
    .catch((error: unknown) => {
      dlog(`injectLinkingIntegration: getInitialURL failed: ${String(error)}`);
    });

  const subscription = Linking.addEventListener('url', (event: IUrlEvent) => {
    dlog(`injectLinkingIntegration: url event "${event.url}"`);
    applyRoute(event.url, navigatorHandle.push);
  });

  destroyRef.onDestroy(() => {
    cancelled = true;
    subscription.remove();
  });
}
