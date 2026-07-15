// useLinkingIntegration: wires the framework-agnostic linking config (../core's
// resolveRouteFromUrl) onto an existing Stack ref's INavigatorHandle. Deliberately NOT called
// from inside stack.ts - app code owns the wiring (a <Stack ref={...}> plus this hook alongside
// it), the same top-level-prop shape @react-navigation keeps `linking` in on NavigationContainer
// rather than baking it into the router itself.

import { useEffect, useRef } from 'react';
import { Linking, dlog } from '@symbiote-native/engine';
import type { IUrlEvent } from '@symbiote-native/engine';
import { resolveRouteFromUrl } from '../core';
import type { ILinkingConfig } from '../core';
import type { INavigatorHandle } from '../core';

export function useLinkingIntegration(
  config: ILinkingConfig,
  navigatorHandle: INavigatorHandle,
): void {
  // Refs, not effect deps: `navigatorHandle` is re-created by Stack on every push/pop
  // (see stack.ts's useMemo deps including `state.routes.length`), so depending on it directly
  // would resubscribe on every navigation instead of once on mount.
  const configRef = useRef(config);
  configRef.current = config;
  const handleRef = useRef(navigatorHandle);
  handleRef.current = navigatorHandle;

  useEffect(() => {
    function applyRoute(url: string, dispatch: (name: string, params?: unknown) => void): void {
      const route = resolveRouteFromUrl(configRef.current, url);
      if (route === null) {
        dlog(`useLinkingIntegration: no route resolved for "${url}"`);
        return;
      }
      dispatch(route.name, route.params);
    }

    let cancelled = false;

    Linking.getInitialURL()
      .then(url => {
        if (cancelled || url === null) return;
        dlog(`useLinkingIntegration: initial URL "${url}"`);
        applyRoute(url, handleRef.current.replace);
      })
      .catch((error: unknown) => {
        dlog(`useLinkingIntegration: getInitialURL failed: ${String(error)}`);
      });

    const subscription = Linking.addEventListener('url', (event: IUrlEvent) => {
      dlog(`useLinkingIntegration: url event "${event.url}"`);
      applyRoute(event.url, handleRef.current.push);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
    // Mount-once: freshness of config/navigatorHandle is read through the refs above.
  }, []);
}
