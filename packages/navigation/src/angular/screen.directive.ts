// [symbioteScreen]: a declarative marker, never rendered on its own - Stack reads its inputs via
// @ContentChildren to build the static name -> {component, options} registry, then mounts the
// registered component itself for each pushed route. Angular's twin of react/screen.ts's Screen
// marker component; mirrors Angular Material's own `@ContentChildren(MatTab) tabs: QueryList<MatTab>`
// pattern (a directive applied to an inert `<ng-template>`, never instantiated as a view - see
// stack.ts's header for why that's safe: @ContentChildren resolves the light-DOM declaration,
// independent of whether the template is ever instantiated).

import { Directive, Input, type Type } from '@angular/core';
import type { ISearchBarCommands, ISearchBarOptions, IScreenOptions, IRoute } from '../core';
import type { INavigatorHandle } from '../core';

// The imperative ref (focus/blur/clearText/setText/cancelSearch/toggleCancelButton) carries a
// framework ref type, so - per CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter> - it cannot
// live in the shared, agnostic ISearchBarOptions (core/navigator-props.ts). Angular has no
// `RefObject` primitive of its own, but the underlying shape (`{ current: T | null }`, mutated
// once the native view is available) is framework-agnostic in itself - the app constructs a plain
// mutable object and this adapter assigns `.current` once the search bar's native node exists
// (search-bar-ref.directive.ts), the same contract react/screen.ts's IReactSearchBarOptions uses.
export type IAngularSearchBarOptions = ISearchBarOptions & {
  ref?: { current: ISearchBarCommands | null };
};

export type IAngularScreenOptions = Omit<IScreenOptions, 'headerSearchBarOptions'> & {
  headerSearchBarOptions?: IAngularSearchBarOptions;
};

// A screen's options can be a plain object or a resolver run OUTSIDE the render lifecycle (when
// Stack folds a route's options): its `navigation` argument is a live navigator handle a bar-button
// onPress closes over, so this is NOT the props-based navigation the screen body reads via inject -
// it's a deliberate escape hatch that stays.
export type IScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: INavigatorHandle;
};

export type IScreenOptionsResolver = (args: IScreenOptionsArgs) => IAngularScreenOptions;

@Directive({
  selector: 'ng-template[symbioteScreen]',
  standalone: true,
})
export class ScreenDirective {
  @Input({ required: true }) name!: string;
  @Input({ required: true }) component!: Type<unknown>;
  @Input() options?: IAngularScreenOptions | IScreenOptionsResolver;
  @Input() initialParams?: unknown;
}
