// The Angular twin of react/navigation-context.ts's `NavigationContext.Provider` usage in
// stack.ts/tabs.ts/drawer.ts's render loops: one directive instance = one fresh scope. Applying
// `[symbioteNavigationScope]` to an element re-`providers: [NavigationContextService]`
// (component/directive-level DI), so every usage mints its OWN service instance - the DI twin of
// `createElement(NavigationContext.Provider, { value }, content)`. Descendants (a screen's own
// component tree, reached through `*ngComponentOutlet`) call `inject(NavigationContextService)`
// and resolve to the NEAREST enclosing instance, exactly like `useContext(NavigationContext)`
// walks to the nearest Provider.

import { Directive, Input, inject, type OnChanges } from '@angular/core';
import type { INavigationEmitter, IRoute } from '../core';
import { NavigationContextService, type IAnyNavigatorHandle } from './navigation-context.service';

@Directive({
  selector: '[symbioteNavigationScope]',
  standalone: true,
  providers: [NavigationContextService],
})
export class NavigationScopeDirective implements OnChanges {
  @Input({ required: true, alias: 'symbioteNavigationScope' }) route!: IRoute<unknown>;
  @Input({ required: true }) navigation!: IAnyNavigatorHandle;
  @Input({ required: true }) emitter!: INavigationEmitter;

  private readonly context = inject(NavigationContextService);

  ngOnChanges(): void {
    this.context.setRoute(this.route);
    this.context.navigation = this.navigation;
    this.context.emitter = this.emitter;
  }
}
