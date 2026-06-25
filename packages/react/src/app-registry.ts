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
import { getNativeModule, dlog, type RootTag } from '@symbiote/shared'
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

// RN's WrapperComponentProvider: given the surface's parameters, returns a
// component to wrap the app root in (e.g. a context provider). Optional.
export type WrapperComponentProvider = (
  appParameters: AppParameters,
) => ComponentType<object>

// A point-in-time view of the registry — section keys plus the runnable map,
// mirroring RN's `getRegistry` (AppRegistryImpl.js:140).
export interface Registry {
  sections: string[]
  runnables: Record<string, Runnable>
}

// A headless task: a bit of code that runs without a UI, resolving when done.
// Mirrors RN's `HeadlessTask` (AppRegistry.flow.js:16).
export type HeadlessTask = (taskData: unknown) => Promise<void>

// Lazy provider of a headless task (so the task module graph stays cheap until
// native actually starts it). Mirrors RN's `TaskProvider`.
export type TaskProvider = () => HeadlessTask

// Cancels a running headless task. Mirrors RN's `TaskCanceller`.
export type TaskCanceller = () => void

// Lazy provider of a task canceller, paired with a registered task.
export type TaskCancelProvider = () => TaskCanceller

// The native module backing headless tasks. RN registers it under the name
// "HeadlessJsTaskSupport" (the spec's TurboModuleRegistry.get<Spec>(...) name in
// NativeHeadlessJsTaskSupport.js); per .docs/decisions/0012 the module name is
// platform-specific, but this spec uses the same name on both platforms. A
// headless fake answers to any name, so on-device resolution is the only proof.
interface NativeHeadlessJsTaskSupport {
  notifyTaskFinished?(taskId: number): void
  notifyTaskRetry?(taskId: number): Promise<boolean>
}

const HEADLESS_TASK_MODULE = 'HeadlessJsTaskSupport'

// The host's runnable registrar — RN's own AppRegistry. Injected by the app glue
// so the adapter never imports react-native; native drives RN's AppRegistry, which
// must hold our runnable under the app key for the surface to find it.
export interface HostRegistrar {
  registerRunnable(appKey: string, run: Runnable): string
  // Native unmount of a surface by rootTag. RN routes this through RendererProxy's
  // `unmountComponentAtNodeAndRemoveContainer` (AppRegistryImpl.js:212); the host
  // owns the container teardown, so we delegate when wired and no-op headless.
  unmountAtRootTag?(rootTag: RootTag): void
}

let hostRegistrar: HostRegistrar | undefined

export function setHostRegistrar(registrar: HostRegistrar): void {
  hostRegistrar = registrar
}

const runnables = new Map<string, Runnable>()
const sections = new Map<string, Runnable>()
const taskProviders = new Map<string, TaskProvider>()
const taskCancelProviders = new Map<string, TaskCancelProvider>()

// RN wraps the app root in this component when set (AppRegistryImpl.js:45), so a
// host can inject app-wide context. Applied in `runnableFor`.
let wrapperComponentProvider: WrapperComponentProvider | undefined

function runnableFor(componentProvider: ComponentProvider): Runnable {
  return (appParameters) => {
    dlog(`AppRegistry: mounting on rootTag ${String(appParameters.rootTag)}`)
    let element = createElement(componentProvider(), appParameters.initialProps)
    // Wrap the root when a provider is set, mirroring RN's `registerComponent`
    // passing `wrapperComponentProvider && wrapperComponentProvider(...)` into
    // renderApplication (AppRegistryImpl.js:80).
    if (wrapperComponentProvider !== undefined) {
      element = createElement(wrapperComponentProvider(appParameters), null, element)
    }
    mount(appParameters.rootTag, element)
  }
}

function register(appKey: string, run: Runnable, section = false): string {
  runnables.set(appKey, run)
  if (section) sections.set(appKey, run)
  // Bridge to the native registrar so the Fabric host can mount this app by key.
  // Absent (headless / not yet wired) → registration is local only, which is what
  // runApplication and the smokes drive directly.
  hostRegistrar?.registerRunnable(appKey, run)
  return appKey
}

// Runs a registered headless task and drives the native completion/retry
// protocol, mirroring RN's `startHeadlessTask` (AppRegistryImpl.js:255). Native
// is the only caller; it must be told when the task settles so the OS can release
// the wakelock. Headless (no native module) → we just run the task.
function runHeadlessTask(taskId: number, taskKey: string, data: unknown): void {
  const native = getNativeModule<NativeHeadlessJsTaskSupport>(HEADLESS_TASK_MODULE)
  dlog(`AppRegistry.startHeadlessTask: ${taskKey} (taskId=${taskId})`)

  const provider = taskProviders.get(taskKey)
  if (provider === undefined) {
    dlog(`AppRegistry.startHeadlessTask: no task registered for key "${taskKey}"`)
    native?.notifyTaskFinished?.(taskId)
    return
  }

  void provider()(data)
    .then(() => {
      native?.notifyTaskFinished?.(taskId)
    })
    .catch((reason: unknown) => {
      dlog(`AppRegistry.startHeadlessTask: "${taskKey}" failed: ${String(reason)}`)
      // RN asks native whether a retry was scheduled; if not, finish the task.
      // Without the native module there is nothing to notify.
      const retry = native?.notifyTaskRetry?.(taskId)
      if (retry === undefined) {
        native?.notifyTaskFinished?.(taskId)
        return
      }
      void retry.then((retryPosted) => {
        if (!retryPosted) native?.notifyTaskFinished?.(taskId)
      })
    })
}

export const AppRegistry = {
  registerComponent(appKey: string, componentProvider: ComponentProvider): string {
    return register(appKey, runnableFor(componentProvider))
  },

  registerRunnable(appKey: string, run: Runnable): string {
    return register(appKey, run)
  },

  // Registers an app as a section, mirroring RN's `registerSection`
  // (AppRegistryImpl.js:115). Same path as a component, additionally tracked under
  // the section keys.
  registerSection(appKey: string, componentProvider: ComponentProvider): string {
    return register(appKey, runnableFor(componentProvider), true)
  },

  runApplication(appKey: string, appParameters: AppParameters): void {
    const run = runnables.get(appKey)
    if (run === undefined) {
      dlog(`AppRegistry.runApplication: no app registered for "${appKey}"`)
      return
    }
    run(appParameters)
  },

  // Tears down a mounted surface by rootTag, delegating to the host registrar
  // (RN routes through RendererProxy — AppRegistryImpl.js:212). No-op headless.
  unmountApplicationComponentAtRootTag(rootTag: RootTag): void {
    dlog(`AppRegistry.unmountApplicationComponentAtRootTag: rootTag ${String(rootTag)}`)
    hostRegistrar?.unmountAtRootTag?.(rootTag)
  },

  // Installs the wrapper-component provider used by every subsequent mount
  // (AppRegistryImpl.js:45).
  setWrapperComponentProvider(provider: WrapperComponentProvider): void {
    wrapperComponentProvider = provider
  },

  getAppKeys(): string[] {
    return [...runnables.keys()]
  },

  // The runnable registered under an app key, or undefined (AppRegistryImpl.js:136).
  getRunnable(appKey: string): Runnable | undefined {
    return runnables.get(appKey)
  },

  // Section keys only (AppRegistryImpl.js:126).
  getSectionKeys(): string[] {
    return [...sections.keys()]
  },

  // The section runnables as a plain map (AppRegistryImpl.js:130).
  getSections(): Record<string, Runnable> {
    return Object.fromEntries(sections)
  },

  // A point-in-time registry snapshot (AppRegistryImpl.js:140).
  getRegistry(): Registry {
    return {
      sections: [...sections.keys()],
      runnables: Object.fromEntries(runnables),
    }
  },

  // ---- headless tasks ----------------------------------------------------

  // Registers a headless task — code that runs without a UI. Mirrors RN's
  // `registerHeadlessTask` (AppRegistryImpl.js:221): a thin wrapper over
  // `registerCancellableHeadlessTask` with a no-op canceller.
  registerHeadlessTask(taskKey: string, taskProvider: TaskProvider): void {
    AppRegistry.registerCancellableHeadlessTask(taskKey, taskProvider, () => () => {})
  },

  // Registers a cancellable headless task (AppRegistryImpl.js:236).
  registerCancellableHeadlessTask(
    taskKey: string,
    taskProvider: TaskProvider,
    taskCancelProvider: TaskCancelProvider,
  ): void {
    if (taskProviders.has(taskKey)) {
      dlog(`AppRegistry: headless task registered multiple times for key "${taskKey}"`)
    }
    taskProviders.set(taskKey, taskProvider)
    taskCancelProviders.set(taskKey, taskCancelProvider)
  },

  // Only called from native: starts a registered headless task and drives the
  // native completion/retry protocol (AppRegistryImpl.js:255).
  startHeadlessTask(taskId: number, taskKey: string, data: unknown): void {
    runHeadlessTask(taskId, taskKey, data)
  },

  // Only called from native: cancels a running headless task (AppRegistryImpl.js:301).
  cancelHeadlessTask(taskId: number, taskKey: string): void {
    dlog(`AppRegistry.cancelHeadlessTask: ${taskKey} (taskId=${taskId})`)
    const cancelProvider = taskCancelProviders.get(taskKey)
    if (cancelProvider === undefined) {
      dlog(`AppRegistry.cancelHeadlessTask: no canceller registered for key "${taskKey}"`)
      return
    }
    cancelProvider()()
  },
}
