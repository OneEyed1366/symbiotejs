// The descriptor→element bridge for Vue. A render function in @symbiote/components returns
// a framework-agnostic `Descriptor` tree; this maps it onto Vue vnodes via h(). The host
// vnode (`symbiote-view`, `symbiote-activity-indicator`, …) flows on through the Vue custom
// renderer → engine → Fabric, exactly like a hand-written h('symbiote-view'). The React
// twin is `adapters/react/src/descriptor-to-react.ts`.

import { h, type VNode } from '@vue/runtime-core';
import type { IDescriptor, IDescriptorChild } from '@symbiote/components';

export function descriptorToVue(node: IDescriptor): VNode {
  // String type → host element (the Vue renderer's createElement → descriptorFor maps it to
  // a Fabric name); array children, since these are host elements, not slotted components.
  return h(node.type, { ...node.props, key: node.key }, node.children.map(toChild));
}

function toChild(child: IDescriptorChild): VNode | string {
  return typeof child === 'string' ? child : descriptorToVue(child);
}
