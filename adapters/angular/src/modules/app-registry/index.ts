// AppRegistry: the JS entry point RN apps already use:
//   AppRegistry.registerComponent(appKey, () => App)
// The registry bookkeeping (sections, host-registrar bridge, headless tasks) is
// framework-agnostic and lives in @symbiotejs/engine's createAppRegistry; this file supplies
// only the one Angular-specific seam — building a runnable from a component provider via
// `mount`'s wrapper/initialProps support (render.ts) — so examples/angular's own
// registerRunnable + mount call can move onto the same entry point React/Vue already have.

import type { Type } from '@angular/core';
import { createAppRegistry, dlog, type IAppParameters, type IRunnable } from '@symbiotejs/engine';
import { mount } from '../../render';

// RN's IComponentProvider: a thunk returning the root component (lazy so the module
// graph stays cheap until the app actually runs).
export type IComponentProvider = () => Type<unknown>;

// RN's IWrapperComponentProvider: given the surface's parameters, returns a
// component to wrap the app root in (e.g. a context provider). Optional. Angular has no
// runtime template synthesis (no JIT under AOT/Metro — see create-animated-component.ts),
// so the wrapper must be a pre-authored standalone @Component whose template renders
// `<ng-content>` — the Angular idiom for "render my children" (mount() projects the root's
// host node into it, the twin of React's createElement(Wrapper, null, rootElement)).
export type IWrapperComponentProvider = (appParameters: IAppParameters) => Type<unknown>;

function runnableFor(
  componentProvider: IComponentProvider,
  getWrapperComponentProvider: () => IWrapperComponentProvider | undefined,
): IRunnable {
  return appParameters => {
    dlog(`AppRegistry: mounting on rootTag ${String(appParameters.rootTag)}`);
    // Read live (not at registration time) so setWrapperComponentProvider affects every
    // runnable's next run, not just future ones.
    mount(appParameters.rootTag, componentProvider(), {
      initialProps: appParameters.initialProps,
      wrapperComponent: getWrapperComponentProvider()?.(appParameters),
    });
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
