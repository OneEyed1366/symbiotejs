// Mount a React element tree onto a Fabric surface. The native host hands us a
// rootTag (via AppRegistry.registerRunnable); we create a surface for it and let
// the reconciler drive shared, which commits into nativeFabricUIManager.

import type { ReactNode } from 'react'
import {
  createSurface,
  disposeRoot,
  setEventDispatcher,
  dlog,
  type RootTag,
  type SymbioteSurface,
} from '@symbiote/shared'
import reconciler, { withDiscretePriority } from './host-config'
import { LegacyRoot } from './reconciler-constants'

const noop = (): void => {}

// A native event runs the listener (which may call setState) outside React's
// loop. Run it at discrete priority so the update takes the sync lane, then
// flush that work synchronously to paint the result.
setEventDispatcher((run) => {
  withDiscretePriority(run)
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork()
})

// The reconciler container per surface, so a surface can be torn down (stopSurface)
// or cleanly re-mounted on the same rootTag. The bridgeless host stops and restarts a
// surface on Fast Refresh and on lifecycle/focus changes, reusing the rootTag.
type OpaqueRoot = ReturnType<typeof reconciler.createContainer>
const containers = new Map<RootTag, OpaqueRoot>()

// Unmount a surface's React tree (render null → empty completeRoot, clearing the
// native views) and drop its shared root container so a later mount on the same
// rootTag rebuilds from scratch instead of cloning the stopped surface's dead handles.
function teardown(rootTag: RootTag): void {
  const container = containers.get(rootTag)
  if (container === undefined) return
  // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
  reconciler.updateContainerSync(null, container, null, noop)
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork()
  containers.delete(rootTag)
  disposeRoot(rootTag)
}

export function mount(rootTag: RootTag, element: ReactNode): SymbioteSurface {
  // A re-mount on a live rootTag (host restarted the surface without stopping it
  // first) starts clean — otherwise the stale container double-drives the surface.
  teardown(rootTag)

  const surface = createSurface(rootTag)

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
  )
  containers.set(rootTag, container)

  // react-reconciler 0.33 exposes updateContainerSync + flushSyncWork for an
  // immediate render/commit; @types 0.32 still lists the older updateContainer /
  // flushSync names, so these calls are type-suppressed until the types catch up.
  // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
  reconciler.updateContainerSync(element, container, null, noop)
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork()

  return surface
}

// Tear down a surface by rootTag. This is the JS half of the bridgeless stopSurface
// contract (see installStopSurfaceGlobal): the native AppRegistryBinding calls our
// global to stop a surface; we unmount its tree and dispose its root.
export function stopSurface(rootTag: RootTag): void {
  dlog(`stopSurface root=${rootTag}`)
  teardown(rootTag)
}

// `global.RN$stopSurface` is the JSI hook the C++ AppRegistryBinding::stopSurface calls
// to stop a Fabric surface. RN installs it from its own renderer (ReactFabric.js:
// `global.RN$stopSurface = ReactFabric.stopSurface`). Because symbiote REPLACES RN's
// renderer, that line never runs, so without this the binding throws "Global was not
// installed" on every surface stop — Fast Refresh and focus/lifecycle changes then fail
// to tear down, the host loops start/stop, and the screen goes blank. We install our own.
declare global {
  // eslint-disable-next-line no-var
  var RN$stopSurface: ((surfaceId: number) => void) | undefined
}

function installStopSurfaceGlobal(): void {
  globalThis.RN$stopSurface = (surfaceId: number): void => {
    stopSurface(surfaceId)
  }
  dlog('installed global.RN$stopSurface')
}

installStopSurfaceGlobal()
