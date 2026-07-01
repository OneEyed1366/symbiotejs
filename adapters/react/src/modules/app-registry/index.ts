// AppRegistry: the JS entry point RN apps already use:
//   AppRegistry.registerComponent(appKey, () => App)
// The registry bookkeeping (sections, host-registrar bridge, headless tasks) is
// framework-agnostic and lives in @symbiote/engine's createAppRegistry; this file supplies
// only the one React-specific seam — building a runnable from a component provider via
// createElement + mount — so existing RN app-entry code ports verbatim.

import { createElement, type ComponentType } from 'react';
import { createAppRegistry, dlog, type IAppParameters, type IRunnable } from '@symbiote/engine';
import { mount } from '../../render';

// RN's IComponentProvider: a thunk returning the root component (lazy so the module
// graph stays cheap until the app actually runs).
export type IComponentProvider = () => ComponentType<object>;

// RN's IWrapperComponentProvider: given the surface's parameters, returns a
// component to wrap the app root in (e.g. a context provider). Optional.
export type IWrapperComponentProvider = (appParameters: IAppParameters) => ComponentType<object>;

function runnableFor(
  componentProvider: IComponentProvider,
  getWrapperComponentProvider: () => IWrapperComponentProvider | undefined,
): IRunnable {
  return appParameters => {
    dlog(`AppRegistry: mounting on rootTag ${String(appParameters.rootTag)}`);
    let element = createElement(componentProvider(), appParameters.initialProps);
    // Wrap the root when a provider is set, mirroring RN's `registerComponent`
    // passing `wrapperComponentProvider && wrapperComponentProvider(...)` into
    // renderApplication (AppRegistryImpl.js:80). Read live (not at registration time) so
    // setWrapperComponentProvider affects every runnable's next run, not just future ones.
    const wrapperComponentProvider = getWrapperComponentProvider();
    if (wrapperComponentProvider !== undefined) {
      element = createElement(wrapperComponentProvider(appParameters), null, element);
    }
    mount(appParameters.rootTag, element);
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
} from '@symbiote/engine';
