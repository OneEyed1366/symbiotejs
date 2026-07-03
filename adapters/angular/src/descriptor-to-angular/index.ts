// Angular descriptor outlet. The React/Vue bridges can return framework elements directly
// (`descriptorToReact` / `descriptorToVue`); Angular needs a tiny standalone component that
// consumes a Descriptor tree and drives Renderer2 imperatively. This mirrors wolf-tui's
// WNodeOutlet, but patches same type/key nodes instead of clearing and recreating the subtree so
// Symbiote keeps retained-node identity and Fabric stays on the clone-on-write path.

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Input,
  Renderer2,
  type OnChanges,
  type OnDestroy,
  type SimpleChanges,
} from '@angular/core';
import type { IDescriptor, IDescriptorChild } from '@symbiotejs/components';

type IRenderedChild = IRenderedElement | IRenderedText;

type IRenderedElement = {
  kind: 'element';
  node: unknown;
  descriptor: IDescriptor;
  props: Record<string, unknown>;
  children: IRenderedChild[];
};

type IRenderedText = {
  kind: 'text';
  node: unknown;
  value: string;
};

@Component({
  selector: 'symbiote-descriptor-outlet',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DescriptorOutlet implements OnChanges, OnDestroy {
  @Input({ required: true }) node!: IDescriptor;

  private readonly renderer = inject(Renderer2);
  private readonly hostNode = inject<ElementRef<unknown>>(ElementRef).nativeElement;
  private rendered: IRenderedElement | undefined;

  ngOnChanges(changes: SimpleChanges): void {
    if (!('node' in changes) || this.node === undefined) return;
    this.rendered = this.patchRoot(this.rendered, this.node);
  }

  ngOnDestroy(): void {
    if (this.rendered === undefined) return;
    this.renderer.removeChild(this.hostNode, this.rendered.node);
    this.rendered = undefined;
  }

  private patchRoot(rendered: IRenderedElement | undefined, next: IDescriptor): IRenderedElement {
    if (rendered === undefined) {
      const created = this.createElement(next);
      this.renderer.appendChild(this.hostNode, created.node);
      return created;
    }
    return this.patchElement(this.hostNode, rendered, next);
  }

  private createChild(child: IDescriptorChild): IRenderedChild {
    return typeof child === 'string' ? this.createText(child) : this.createElement(child);
  }

  private createText(value: string): IRenderedText {
    return { kind: 'text', node: this.renderer.createText(value), value };
  }

  private createElement(descriptor: IDescriptor): IRenderedElement {
    const node = this.renderer.createElement(descriptor.type);
    const props = { ...descriptor.props };
    for (const [key, value] of Object.entries(props)) {
      this.renderer.setProperty(node, key, value);
    }

    const children = descriptor.children.map(child => this.createChild(child));
    for (const child of children) {
      this.renderer.appendChild(node, child.node);
    }

    return { kind: 'element', node, descriptor, props, children };
  }

  private patchChild(
    parent: unknown,
    rendered: IRenderedChild,
    next: IDescriptorChild,
  ): IRenderedChild {
    if (typeof next === 'string') {
      if (rendered.kind === 'text') {
        if (rendered.value !== next) {
          this.renderer.setValue(rendered.node, next);
          rendered.value = next;
        }
        return rendered;
      }
      const replacement = this.createText(next);
      this.replaceChild(parent, rendered.node, replacement.node);
      return replacement;
    }

    if (rendered.kind === 'element') {
      return this.patchElement(parent, rendered, next);
    }
    const replacement = this.createElement(next);
    this.replaceChild(parent, rendered.node, replacement.node);
    return replacement;
  }

  private patchElement(
    parent: unknown,
    rendered: IRenderedElement,
    next: IDescriptor,
  ): IRenderedElement {
    if (!sameElement(rendered.descriptor, next)) {
      const replacement = this.createElement(next);
      this.replaceChild(parent, rendered.node, replacement.node);
      return replacement;
    }

    this.patchProps(rendered, next.props);
    rendered.children = this.patchChildren(rendered.node, rendered.children, next.children);
    rendered.descriptor = next;
    return rendered;
  }

  private patchProps(rendered: IRenderedElement, nextProps: Record<string, unknown>): void {
    const prevProps = rendered.props;
    for (const key of Object.keys(prevProps)) {
      if (!(key in nextProps)) {
        this.renderer.setProperty(rendered.node, key, undefined);
      }
    }
    for (const [key, value] of Object.entries(nextProps)) {
      if (!Object.is(prevProps[key], value)) {
        this.renderer.setProperty(rendered.node, key, value);
      }
    }
    rendered.props = { ...nextProps };
  }

  private patchChildren(
    parent: unknown,
    renderedChildren: IRenderedChild[],
    nextChildren: IDescriptorChild[],
  ): IRenderedChild[] {
    const nextRendered: IRenderedChild[] = [];
    const common = Math.min(renderedChildren.length, nextChildren.length);

    for (let i = 0; i < common; i++) {
      const rendered = renderedChildren[i];
      const next = nextChildren[i];
      if (rendered !== undefined && next !== undefined) {
        nextRendered.push(this.patchChild(parent, rendered, next));
      }
    }

    for (let i = common; i < nextChildren.length; i++) {
      const next = nextChildren[i];
      if (next === undefined) continue;
      const child = this.createChild(next);
      this.renderer.appendChild(parent, child.node);
      nextRendered.push(child);
    }

    for (let i = common; i < renderedChildren.length; i++) {
      const rendered = renderedChildren[i];
      if (rendered !== undefined) this.renderer.removeChild(parent, rendered.node);
    }

    return nextRendered;
  }

  private replaceChild(parent: unknown, oldChild: unknown, newChild: unknown): void {
    this.renderer.insertBefore(parent, newChild, oldChild);
    this.renderer.removeChild(parent, oldChild);
  }
}

function sameElement(prev: IDescriptor, next: IDescriptor): boolean {
  return prev.type === next.type && prev.key === next.key;
}
