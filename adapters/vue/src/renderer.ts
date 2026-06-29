// A Vue 3 custom renderer over @symbiote/engine. Each RendererOptions method maps onto
// the engine's tiny mutation API; the engine owns all Fabric clone-on-write, so Vue
// drives the exact same retained tree React does: the proof the core is framework-
// agnostic (M3 / R4).

import { createRenderer, type RendererOptions } from '@vue/runtime-core';
import {
  appendChild,
  createAnchor,
  createElement,
  createRawText,
  dlog,
  insertBefore,
  removeChild,
  routeProp,
  setText,
  toPublicInstance,
  RAW_TEXT_COMPONENT,
  SymbioteSurface,
  type ISymbioteNode,
} from '@symbiote/engine';
import { descriptorFor } from '@symbiote/components';

// Vue host nodes are all SymbioteNode (elements, raw text, anchors). The mount
// container is the surface, so a parent can be either a node or the surface root.
type IHostNode = ISymbioteNode;
type IHostElement = ISymbioteNode | SymbioteSurface;

function isSurface(parent: IHostElement): parent is SymbioteSurface {
  return parent instanceof SymbioteSurface;
}

function isRawText(node: ISymbioteNode): boolean {
  return node.component === RAW_TEXT_COMPONENT;
}

// One renderer per mounted surface: the options close over the surface so every mutation
// can ask it to (microtask-coalesced) recommit. Vue has no resetAfterCommit; instead
// requestCommit() collapses a burst of insert/patchProp within one tick into a single
// completeRoot, exactly the seam the engine already exposes for reactive frameworks.
export function createSymbioteRenderer(surface: SymbioteSurface) {
  const options: RendererOptions<IHostNode, IHostElement> = {
    createElement(type) {
      const descriptor = descriptorFor(type);
      const node = createElement(descriptor.component, descriptor.isText);
      // Graft the imperative public-instance API (measure / setNativeProps / focus / …) onto
      // the raw node so a template/function ref to a host element exposes it exactly like
      // React's getPublicInstance. toPublicInstance mutates in place and returns the SAME node
      // identity, so the engine commit mirror (keyed on the raw node) still resolves it — the
      // ref must keep holding this raw node by identity (shallowRef), never a deep ref. See the
      // vue-adapter-reactivity skill.
      dlog(`vue createElement ${descriptor.component} -> public instance`);
      return toPublicInstance(node);
    },

    createText(text) {
      // Vue mounts Fragment boundaries (v-for / v-if lists / multi-root) as EMPTY text
      // nodes via hostCreateText(''), NOT comments, then inserts them into the (usually
      // non-Text) container. A raw text outside a <Text> is invalid in Fabric, so an empty
      // text here is never real content; it's a positional anchor. Map it to an engine
      // anchor (skipped by the commit walk, no native view), exactly like createComment.
      // Non-empty text is genuine RCTRawText content and must live inside a <Text>.
      return text === '' ? createAnchor() : createRawText(text);
    },

    // Fragment / v-if / v-for placeholder. A real retained node so insert/nextSibling/
    // parentNode ordering stays correct, but the engine's commit walk skips it: no
    // native view is ever created. (wolf-tui fakes a comment with an empty text node;
    // here an empty RCTRawText would actually paint, so an anchor is the right call.)
    createComment() {
      return createAnchor();
    },

    setText(node, text) {
      setText(node, text);
      surface.requestCommit();
    },

    setElementText(el, text) {
      if (isSurface(el)) return;
      // An RCTText carries its string as a single raw-text child. Reuse a lone existing
      // one to avoid churn; otherwise replace all children with a fresh raw-text node.
      const [first] = el.children;
      if (el.children.length === 1 && first !== undefined && isRawText(first)) {
        setText(first, text);
      } else {
        for (const child of el.children.slice()) removeChild(el, child);
        appendChild(el, createRawText(text));
      }
      surface.requestCommit();
    },

    insert(child, parent, anchor) {
      if (isRawText(child) && (isSurface(parent) || !parent.isText)) {
        throw new Error(
          `Text string "${String(child.props.text)}" must be rendered inside a <Text>`,
        );
      }
      if (isSurface(parent)) {
        if (anchor) parent.insertBefore(child, anchor);
        else parent.appendChild(child);
      } else if (anchor) {
        insertBefore(parent, child, anchor);
      } else {
        appendChild(parent, child);
      }
      surface.requestCommit();
    },

    remove(child) {
      // A top-level node has no parent (it lives in surface.children); everything else
      // detaches from its retained parent.
      const parent = child.parent;
      if (parent !== undefined) removeChild(parent, child);
      else surface.removeChild(child);
      surface.requestCommit();
    },

    parentNode(node) {
      return node.parent ?? surface;
    },

    nextSibling(node) {
      const siblings = node.parent !== undefined ? node.parent.children : surface.children;
      const index = siblings.indexOf(node);
      return index >= 0 ? (siblings[index + 1] ?? null) : null;
    },

    patchProp(el, key, _prev, next) {
      if (isSurface(el)) return;
      // routeProp makes the prop-vs-event decision from the node's ViewConfig (onPress on
      // a View becomes a listener; onTintColor on a Switch stays a prop): identical to
      // the React host config, so the whole event layer is shared.
      routeProp(el, key, next);
      surface.requestCommit();
    },

    // RN has no querySelector / scope-id / innerHTML. The first two are inert; static
    // hoisting is meaningless without a raw-HTML host, so insertStaticContent degrades to
    // an empty anchor pair (logged, never painting) rather than crashing Vue's contract.
    querySelector: () => null,
    setScopeId: () => {},
    insertStaticContent(_content, parent, anchor) {
      dlog('vue insertStaticContent unsupported — degrading to empty anchor');
      const node = createAnchor();
      options.insert(node, parent, anchor ?? null);
      return [node, node];
    },
  };

  return createRenderer<IHostNode, IHostElement>(options);
}
