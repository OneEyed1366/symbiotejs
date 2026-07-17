// Mount a React element tree onto a Fabric surface. The native host hands us a
// rootTag (via AppRegistry.registerRunnable); we create a surface for it and let
// the reconciler drive shared, which commits into nativeFabricUIManager.

import type { ReactNode } from 'react';
import {
  createSurface,
  disposeRoot,
  setEventDispatcher,
  dlog,
  type IRootTag,
  type SymbioteSurface,
} from '@symbiote-native/engine';
import reconciler, { withDiscretePriority } from './host-config';
import { LegacyRoot } from './reconciler-constants';

const noop = (): void => {};

// A native event runs the listener (which may call setState) outside React's
// loop. Run it at discrete priority so the update takes the sync lane, then
// flush that work synchronously to paint the result.
//
// Diagnostic seam (gated, perf investigation): every native event forces its own
// synchronous flush here, with no continuous-vs-discrete split (unlike DOM React,
// which lets high-frequency continuous events like drag/scroll coalesce). This
// dlog counts how many forced flushes one gesture (e.g. a Slider drag) produces,
// to compare against Vue/Angular's microtask-coalesced requestCommit(). Kept
// behind DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
setEventDispatcher(run => {
  withDiscretePriority(run);
  dlog('react event-dispatch: forced flushSyncWork');
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork();
});

// The reconciler container per surface, so a surface can be torn down (unmount)
// or cleanly re-mounted on the same rootTag. The bridgeless host stops and restarts a
// surface on Fast Refresh and on lifecycle/focus changes, reusing the rootTag.
type IOpaqueRoot = ReturnType<typeof reconciler.createContainer>;
const containers = new Map<IRootTag, IOpaqueRoot>();

// Unmount a surface's React tree (render null → empty completeRoot, clearing the
// native views) and drop its shared root container so a later mount on the same
// rootTag rebuilds from scratch instead of cloning the stopped surface's dead handles.
function teardown(rootTag: IRootTag): void {
  const container = containers.get(rootTag);
  if (container === undefined) return;
  // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
  reconciler.updateContainerSync(null, container, null, noop);
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork();
  containers.delete(rootTag);
  disposeRoot(rootTag);
}

export function mount(rootTag: IRootTag, element: ReactNode): SymbioteSurface {
  // A re-mount on a live rootTag (host restarted the surface without stopping it
  // first) starts clean. Otherwise the stale container double-drives the surface.
  teardown(rootTag);

  const surface = createSurface(rootTag);

  const container = reconciler.createContainer(
    surface,
    LegacyRoot,
    null,
    false,
    null,
    'symbiote',
    noop,
    noop,
    noop,
    noop,
    null,
  );
  containers.set(rootTag, container);

  // react-reconciler 0.33 exposes updateContainerSync + flushSyncWork for an
  // immediate render/commit; @types 0.32 still lists the older updateContainer /
  // flushSync names, so these calls are type-suppressed until the types catch up.
  // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
  reconciler.updateContainerSync(element, container, null, noop);
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork();

  return surface;
}

// Tear down a surface by rootTag, the public pair of `mount`. This is also the JS half of
// the bridgeless `RN$stopSurface` contract (see installStopSurfaceGlobal): the native
// AppRegistryBinding calls our global to stop a surface; we unmount its tree and dispose its root.
export function unmount(rootTag: IRootTag): void {
  dlog(`unmount root=${rootTag}`);
  teardown(rootTag);
}

// `global.RN$stopSurface` is the JSI hook the C++ AppRegistryBinding::stopSurface calls
// to stop a Fabric surface. RN installs it from its own renderer (ReactFabric.js:
// `global.RN$stopSurface = ReactFabric.stopSurface`). Because symbiote REPLACES RN's
// renderer, that line never runs, so without this the binding throws "Global was not
// installed" on every surface stop. Fast Refresh and focus/lifecycle changes then fail
// to tear down, the host loops start/stop, and the screen goes blank. We install our own.
declare global {
  var RN$stopSurface: ((surfaceId: number) => void) | undefined;
}

function installStopSurfaceGlobal(): void {
  globalThis.RN$stopSurface = (surfaceId: number): void => {
    unmount(surfaceId);
  };
  dlog('installed global.RN$stopSurface');
}

installStopSurfaceGlobal();
