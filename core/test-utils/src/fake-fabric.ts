// One shared fake `nativeFabricUIManager` for the unit suite (ADR 0025). `installFabric()`
// puts a fresh recording slot on `globalThis` and returns a handle to inspect what the
// renderer committed. It replaces the per-file slot the smokes each copy-pasted (×65).
//
// Faithful persistent (clone-on-write) semantics, identical to what the engine drives
// against real Fabric: every clone is a NEW identity; `*NewProps` MERGES the payload onto
// the previous props (the engine always sends a minimal diff — see `diffProps` in
// commit.ts — and relies on native Fabric to merge it onto the retained props; a removed
// key arrives as literal `null` and is kept as `null`, not deleted, so a test can still see
// "explicitly reset" distinct from "never set"); the `*Children` variants reset children
// (the engine re-appends). A persistence bug in the fake is now fixed once, here, for every
// test, mirroring `clone_on_write_lives_in_engine`.

export interface IFakeNode {
  tag: number;
  viewName: string;
  props: Record<string, unknown>;
  children: IFakeNode[];
  instanceHandle: unknown;
}

export type IEventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void;

export interface IFabricRecorder {
  /** The child set handed to the most recent `completeRoot`. */
  committed: IFakeNode[];
  /** Every node ever `createNode`'d this run (clones excluded). */
  created: IFakeNode[];
  /** Every imperative command dispatched at a committed Fabric node. */
  commands: Array<{ node: IFakeNode; commandName: string; args: readonly unknown[] }>;
  /** Call counters, for tests that assert "exactly N native nodes were created". */
  counts: { createNode: number; completeRoot: number };
  /**
   * RN wraps every commit in a synthetic `box-none` AppContainer root (ADR 0015).
   * Returns it, asserting it is the single expected root, so each test unwraps the
   * AppContainer the same way instead of re-checking the invariant by hand.
   */
  appRoot(): IFakeNode;
  /** Find the first `createNode`'d node matching a predicate (e.g. the app's own View). */
  find(predicate: (node: IFakeNode) => boolean): IFakeNode | undefined;
  /** Deliver a native event to the renderer's registered handler. */
  fireEvent(handle: unknown, topLevelType: string, nativeEvent?: Record<string, unknown>): void;
  /** Serialize a node list to `RCTView(RCTText(RCTRawText "text"))` shorthand. */
  serialize(nodes: IFakeNode[]): string;
  /** Zero the counters and clear `committed` / `created` (the event handler survives). */
  reset(): void;
}

// Mirrors real Fabric's clone*WithNewProps merge: `diff` is a minimal payload (only changed
// keys, plus a removed key sent as literal `null` — kept as `null` here, not deleted, so a
// test can tell "explicitly reset to default" apart from "never set").
function mergeFabricProps(
  previous: Record<string, unknown>,
  diff: Record<string, unknown>,
): Record<string, unknown> {
  return { ...previous, ...diff };
}

export function installFabric(): IFabricRecorder {
  let committed: IFakeNode[] = [];
  const created: IFakeNode[] = [];
  const commands: Array<{ node: IFakeNode; commandName: string; args: readonly unknown[] }> = [];
  const counts = { createNode: 0, completeRoot: 0 };
  let eventHandler: IEventHandler | undefined;

  const slot = {
    createNode(
      tag: number,
      viewName: string,
      _rootTag: number,
      props: Record<string, unknown>,
      instanceHandle: unknown,
    ): IFakeNode {
      counts.createNode += 1;
      const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle };
      created.push(node);
      return node;
    },
    cloneNodeWithNewProps: (node: IFakeNode, newProps: Record<string, unknown>): IFakeNode => ({
      ...node,
      props: mergeFabricProps(node.props, newProps),
    }),
    cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, children: [] }),
    cloneNodeWithNewChildrenAndProps: (
      node: IFakeNode,
      newProps: Record<string, unknown>,
    ): IFakeNode => ({ ...node, props: mergeFabricProps(node.props, newProps), children: [] }),
    createChildSet: (): IFakeNode[] => [],
    appendChild(parent: IFakeNode, child: IFakeNode): IFakeNode {
      parent.children.push(child);
      return parent;
    },
    appendChildToSet(childSet: IFakeNode[], child: IFakeNode): void {
      childSet.push(child);
    },
    completeRoot(_rootTag: number, childSet: IFakeNode[]): void {
      counts.completeRoot += 1;
      committed = childSet;
    },
    registerEventHandler(handler: IEventHandler): void {
      eventHandler = handler;
    },
    dispatchCommand(node: IFakeNode, commandName: string, args: readonly unknown[]): void {
      commands.push({ node, commandName, args });
    },
  };

  Object.assign(globalThis, { nativeFabricUIManager: slot });

  const serializeNode = (node: IFakeNode): string => {
    const text = node.viewName === 'RCTRawText' ? ` "${String(node.props.text)}"` : '';
    const kids = node.children.length ? `(${node.children.map(serializeNode).join('')})` : '';
    return `${node.viewName}${text}${kids}`;
  };

  return {
    get committed() {
      return committed;
    },
    created,
    commands,
    counts,
    appRoot(): IFakeNode {
      const root = committed[0];
      if (committed.length !== 1 || root?.props.pointerEvents !== 'box-none') {
        throw new Error(
          `expected a single box-none AppContainer root, got ${committed.length} node(s)`,
        );
      }
      return root;
    },
    find(predicate): IFakeNode | undefined {
      return created.find(predicate);
    },
    fireEvent(handle, topLevelType, nativeEvent = {}): void {
      if (!eventHandler) throw new Error('no event handler registered by the renderer');
      eventHandler(handle, topLevelType, nativeEvent);
    },
    serialize(nodes): string {
      return nodes.map(serializeNode).join('');
    },
    reset(): void {
      committed = [];
      created.length = 0;
      commands.length = 0;
      counts.createNode = 0;
      counts.completeRoot = 0;
    },
  };
}
