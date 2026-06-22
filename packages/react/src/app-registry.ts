// AppRegistry — the JS entry point RN apps already use:
//   AppRegistry.registerComponent(appKey, () => App)
// RN's version stores a runnable that calls renderApplication (React's own
// renderer); ours stores a runnable that calls `mount`, driving @symbiote/shared
// instead. Everything else is identical, so existing app entry code ports verbatim.
//
// The catch: the native Fabric host invokes RN's AppRegistry (a registered
// callable module) by app key — it can't see ours. So registerComponent must also
// hand its runnable to RN's registrar. We reach it the same way shared reaches
// processColor: a dependency-injected seam (setHostRegistrar), so the adapter
// stays react-native-free and the app glue wires the host once at startup.

import { createElement, type ComponentType } from 'react'
import { dlog, type RootTag } from '@symbiote/shared'
import { mount } from './render'

// RN's ComponentProvider: a thunk returning the root component (lazy so the module
// graph stays cheap until the app actually runs).
export type ComponentProvider = () => ComponentType<object>

// What the native host hands a runnable when it mounts a surface: the surface's
// rootTag plus any initial props passed from native.
export interface AppParameters {
  rootTag: RootTag
  initialProps?: object
}

// What actually mounts an app onto a surface for a given app key.
export type Runnable = (appParameters: AppParameters) => void

// The host's runnable registrar — RN's own AppRegistry. Injected by the app glue
// so the adapter never imports react-native; native drives RN's AppRegistry, which
// must hold our runnable under the app key for the surface to find it.
export interface HostRegistrar {
  registerRunnable(appKey: string, run: Runnable): string
}

let hostRegistrar: HostRegistrar | undefined

export function setHostRegistrar(registrar: HostRegistrar): void {
  hostRegistrar = registrar
}

const runnables = new Map<string, Runnable>()

function runnableFor(componentProvider: ComponentProvider): Runnable {
  return (appParameters) => {
    dlog(`AppRegistry: mounting on rootTag ${String(appParameters.rootTag)}`)
    mount(appParameters.rootTag, createElement(componentProvider(), appParameters.initialProps))
  }
}

function register(appKey: string, run: Runnable): string {
  runnables.set(appKey, run)
  // Bridge to the native registrar so the Fabric host can mount this app by key.
  // Absent (headless / not yet wired) → registration is local only, which is what
  // runApplication and the smokes drive directly.
  hostRegistrar?.registerRunnable(appKey, run)
  return appKey
}

export const AppRegistry = {
  registerComponent(appKey: string, componentProvider: ComponentProvider): string {
    return register(appKey, runnableFor(componentProvider))
  },

  registerRunnable(appKey: string, run: Runnable): string {
    return register(appKey, run)
  },

  runApplication(appKey: string, appParameters: AppParameters): void {
    const run = runnables.get(appKey)
    if (run === undefined) {
      dlog(`AppRegistry.runApplication: no app registered for "${appKey}"`)
      return
    }
    run(appParameters)
  },

  getAppKeys(): string[] {
    return [...runnables.keys()]
  },
}
