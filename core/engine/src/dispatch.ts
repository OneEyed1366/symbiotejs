// The one place a native event re-enters a framework's update loop. A native
// event (a touch from Fabric, a keyboard event from the device hub) runs its
// listener (which may call setState) OUTSIDE the framework's own loop. The
// adapter injects a wrapper that runs the listener at the right priority and
// flushes synchronously so the result paints (React: discrete lane +
// flushSyncWork). Both event rails, Fabric events (events.ts) and device-module
// events (native-events.ts), route through this single seam, so the adapter
// wires it once and both are covered. Default is a pass-through for adapters (and
// the headless harness) that need no wrapping.

let wrapDispatch: (run: () => void) => void = run => {
  run();
};

export function setEventDispatcher(wrap: (run: () => void) => void): void {
  wrapDispatch = wrap;
}

export function runWrapped(run: () => void): void {
  wrapDispatch(run);
}
