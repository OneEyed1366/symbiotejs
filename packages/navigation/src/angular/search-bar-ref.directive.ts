// Assigns the app-supplied `headerSearchBarOptions.ref` (a plain `{ current }` cell - see
// screen.directive.ts's IAngularSearchBarOptions) once the RNSSearchBar native node exists.
// Angular's twin of react/stack.ts's callback `ref` prop on the RNSSearchBar element: a directive
// applied directly onto the raw `<RNSSearchBar>` tag can `inject(ElementRef)` the same way
// SymbioteHostPropsDirective does (primitives/shared.ts's own pattern) - ElementRef.nativeElement
// is the real engine node the moment the element is created (synchronous, no whenCommitted wait
// needed here: buildSearchBarHandle's own methods are already a LAZY getter over the node,
// tolerant of the node existing-but-not-yet-committed, same contract every adapter shares).

import { Directive, Input, inject, type OnDestroy, type OnInit, ElementRef } from '@angular/core';
import { isSymbioteNode, dlog, debugNodeId } from '@symbiote-native/engine';
import { buildSearchBarHandle } from '../core';
import type { ISearchBarCommands } from '../core';

@Directive({
  selector: '[symbioteSearchBarRef]',
  standalone: true,
})
export class SearchBarRefDirective implements OnInit, OnDestroy {
  @Input('symbioteSearchBarRef') ref: { current: ISearchBarCommands | null } | undefined;

  private readonly elementRef = inject<ElementRef<unknown>>(ElementRef);

  ngOnInit(): void {
    if (!this.ref) return;
    const node = this.elementRef.nativeElement;
    if (!isSymbioteNode(node)) {
      this.ref.current = null;
      return;
    }
    dlog(`SearchBarRefDirective: attached to node=${debugNodeId(node)}`);
    this.ref.current = buildSearchBarHandle(() => node);
  }

  ngOnDestroy(): void {
    if (this.ref) this.ref.current = null;
  }
}
