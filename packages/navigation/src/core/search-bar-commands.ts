// The imperative API react-native-screens' own SearchBarProps exposes via its `ref` field
// (SearchBarCommands): each method dispatches a native view command on the RNSSearchBar node
// (SearchBarNativeComponent's supportedCommands: blur/focus/clearText/toggleCancelButton/
// setText/cancelSearch). Framework-agnostic - mirrors @symbiote-native/components'
// buildScrollViewHandle exactly (same lazy-getter shape); the adapter supplies the node getter
// and its own framework-specific ref field (see react/screen.ts's IReactSearchBarOptions - the
// ref itself is per-adapter, same split as IPressableProps).
import { dispatchViewCommand, dlog, type ISymbioteNode } from '@symbiote-native/engine';

export interface ISearchBarCommands {
  focus(): void;
  blur(): void;
  clearText(): void;
  setText(text: string): void;
  cancelSearch(): void;
  toggleCancelButton(show: boolean): void;
}

// dispatchViewCommand itself dlogs a "node not committed" skip; this null case (the ref never
// attached to a live RNSSearchBar at all - e.g. the header's search bar isn't mounted, or a
// stale handle outlived its screen) was the one unlogged gap, silently indistinguishable from
// "the command fired but did nothing". Investigation instrumentation (HeaderOptionsScreen
// unresponsive-buttons bug); kept behind DEBUG per <keep_logs_gate_behind_DEBUG>, never removed.
function warnIfDetached(command: string, node: ISymbioteNode | null): node is ISymbioteNode {
  if (node !== null) return true;
  dlog(
    `SearchBarCommands.${command}: skipped, node is null (ref never attached) at t=${Date.now()}`,
  );
  return false;
}

// Every command is the same 3-line dance: get the (lazily-read) node, bail with a dlog'd warning
// if it's detached, dispatch the native view command. Factored once so the six methods below
// differ only in which command name they dispatch.
function makeCommand(
  getNode: () => ISymbioteNode | null,
  command: string,
): (...args: unknown[]) => void {
  return (...args: unknown[]): void => {
    const node = getNode();
    if (!warnIfDetached(command, node)) return;
    dispatchViewCommand(node, command, args);
  };
}

// `getNode` is a LAZY getter, read on every call - see buildScrollViewHandle's comment for why
// an eager capture would freeze `null`.
export function buildSearchBarHandle(getNode: () => ISymbioteNode | null): ISearchBarCommands {
  return {
    focus: makeCommand(getNode, 'focus'),
    blur: makeCommand(getNode, 'blur'),
    clearText: makeCommand(getNode, 'clearText'),
    setText: makeCommand(getNode, 'setText'),
    cancelSearch: makeCommand(getNode, 'cancelSearch'),
    toggleCancelButton: makeCommand(getNode, 'toggleCancelButton'),
  };
}
