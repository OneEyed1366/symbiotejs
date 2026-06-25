// Mount a Vue app onto a Fabric surface. The native host hands us a rootTag; we create
// a surface for it and let the Vue renderer drive the engine, which commits into
// nativeFabricUIManager — RN's own renderer never in the path.

import {
  createSurface,
  disposeRoot,
  dlog,
  type RootTag,
  type SymbioteSurface,
} from '@symbiote/engine'
import type { App, Component } from '@vue/runtime-core'
import { createSymbioteRenderer } from './renderer'

// One Vue app per surface, so a surface can be torn down (stopSurface) or cleanly
// re-mounted on the same rootTag — the bridgeless host stops and restarts a surface on
// Fast Refresh and on lifecycle/focus changes, reusing the rootTag.
const apps = new Map<RootTag, App>()

function teardown(rootTag: RootTag): void {
  const app = apps.get(rootTag)
  if (app === undefined) return
  app.unmount()
  apps.delete(rootTag)
  disposeRoot(rootTag)
}

export function mount(rootTag: RootTag, rootComponent: Component): SymbioteSurface {
  // A re-mount on a live rootTag starts clean — otherwise the stale app double-drives
  // the surface.
  teardown(rootTag)

  const surface = createSurface(rootTag)
  const renderer = createSymbioteRenderer(surface)
  const app = renderer.createApp(rootComponent)
  apps.set(rootTag, app)

  // The surface IS the Vue container: a top-level mutation routes to surface.appendChild
  // (renderer.ts), and the engine wraps surface.children in its synthetic flex root.
  app.mount(surface)

  return surface
}

export function stopSurface(rootTag: RootTag): void {
  dlog(`stopSurface root=${rootTag}`)
  teardown(rootTag)
}

// `global.RN$stopSurface` is the JSI hook C++ AppRegistryBinding::stopSurface calls to
// stop a Fabric surface. RN installs it from its own renderer; symbiote REPLACES that
// renderer, so without this the binding throws "Global was not installed" on every
// surface stop (Fast Refresh, focus/lifecycle) and the screen goes blank. Same contract
// as the React adapter — an app uses one adapter, so exactly one installer runs.
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
