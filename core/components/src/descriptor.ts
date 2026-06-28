// The framework-agnostic node a render function paints. A `Descriptor` is a tiny VDOM
// description, `{ type, props, children, key }`, that each adapter maps to its own
// element (`descriptorToReact` → React.createElement, `descriptorToVue` → h()). The
// adapter's host element then flows on through its reconciler → engine → Fabric.
//
// The wolf-tui twin is `internal/shared/src/wnode/types.ts` (`WNode` + `wbox`/`wtext`).
// We diverge in one way: `type` is an open host-component string, not a closed two-member
// union, because symbiote paints one host element PER native component
// (`symbiote-activity-indicator`, `symbiote-switch`, …), not just box/text.

// The host component to paint. The three primitives (`symbiote-view` / `symbiote-text` /
// `symbiote-image`) plus any native leaf a component emits, kept open as a string since
// components register their own host element names with the engine.
export type IDescriptorType = string;

// Open prop bag, like an RN host element's props: style, events, accessibility, native
// props all live here. The adapter bridge forwards it onto the framework element verbatim.
export type IDescriptorProps = Record<string, unknown>;

export type IDescriptorChild = IDescriptor | string;

export type IDescriptor = {
  type: IDescriptorType;
  props: IDescriptorProps;
  children: IDescriptorChild[];
  key?: string;
};

// el(): a host element of any type. txt(): shorthand for the `symbiote-text` primitive.
// Mirror wolf-tui's `wbox` / `wtext`.
export function el(
  type: IDescriptorType,
  props: IDescriptorProps = {},
  children: IDescriptorChild[] = [],
  key?: string,
): IDescriptor {
  return { type, props, children, key };
}

export function txt(props: IDescriptorProps = {}, children: IDescriptorChild[] = []): IDescriptor {
  return { type: 'symbiote-text', props, children };
}
