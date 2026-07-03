// AppRegistry: the JS entry point RN apps already use:
//   AppRegistry.registerComponent(appKey, () => App)
// The registry bookkeeping (sections, host-registrar bridge, headless tasks) is
// framework-agnostic and lives in @symbiotejs/engine's createAppRegistry; this file supplies
// only the one Vue-specific seam — building a runnable from a component provider via a
// synthetic functional root (h() has no createElement-style prop/children spread of its
// own targets, so the wrap step is a render function rather than an object merge) — so
// examples/vue-sfc's own registerRunnable + mount call can move onto the same entry point
// React already has.

import { h, type Component, type FunctionalComponent, type VNode } from '@vue/runtime-core';
import { createAppRegistry, dlog, type IAppParameters, type IRunnable } from '@symbiotejs/engine';
import { mount } from '../../render';

// RN's IComponentProvider: a thunk returning the root component (lazy so the module
// graph stays cheap until the app actually runs).
export type IComponentProvider = () => Component;

// RN's IWrapperComponentProvider: given the surface's parameters, returns a
// component to wrap the app root in (e.g. a context provider). Optional.
export type IWrapperComponentProvider = (appParameters: IAppParameters) => Component;

function runnableFor(
  componentProvider: IComponentProvider,
  getWrapperComponentProvider: () => IWrapperComponentProvider | undefined,
): IRunnable {
  return appParameters => {
    dlog(`AppRegistry: mounting on rootTag ${String(appParameters.rootTag)}`);
    const rootComponent = componentProvider();
    const renderRoot = (): VNode => h(rootComponent, appParameters.initialProps);
    // Wrap the root when a provider is set, mirroring RN's `registerComponent` passing
    // `wrapperComponentProvider && wrapperComponentProvider(...)` into renderApplication
    // (AppRegistryImpl.js:80) — Vue's equivalent of React's createElement(Wrapper, null,
    // element) is a default-slot render, since Vue has no standalone element value to nest.
    // Read live (not at registration time) so setWrapperComponentProvider affects every
    // runnable's next run, not just future ones.
    const wrapperComponentProvider = getWrapperComponentProvider();
    const mounted: FunctionalComponent =
      wrapperComponentProvider === undefined
        ? renderRoot
        : () => h(wrapperComponentProvider(appParameters), null, { default: renderRoot });
    mount(appParameters.rootTag, mounted);
  };
}

const { AppRegistry, setHostRegistrar } = createAppRegistry<
  IComponentProvider,
  IWrapperComponentProvider
>(runnableFor);

export { AppRegistry, setHostRegistrar };
export type {
  IAppParameters,
  IRunnable,
  IHostRegistrar,
  IRegistry,
  IHeadlessTask,
  ITaskProvider,
  ITaskCanceller,
  ITaskCancelProvider,
} from '@symbiotejs/engine';
