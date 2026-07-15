// [symbioteDrawerScreen]: Drawer's twin of screen.directive.ts's ScreenDirective - a declarative
// marker read via @ContentChildren to build the static name -> {component, options} registry, then
// Drawer mounts the FOCUSED route's component. Mirrors react/drawer-screen.ts (Drawer's twin) and
// tab-screen.directive.ts (the closer sibling - both are fixed-route-list, no-push navigators).

import { Directive, Input, type Type } from '@angular/core';
import type { IDrawerScreenOptions, IRoute } from '../core';
import type { IDrawerNavigatorHandle } from '../core';

export type IDrawerScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerScreenOptionsResolver = (
  props: IDrawerScreenOptionsArgs,
) => IDrawerScreenOptions;

@Directive({
  selector: 'ng-template[symbioteDrawerScreen]',
  standalone: true,
})
export class DrawerScreenDirective {
  @Input({ required: true }) name!: string;
  @Input({ required: true }) component!: Type<unknown>;
  @Input() options?: IDrawerScreenOptions | IDrawerScreenOptionsResolver;
  @Input() initialParams?: unknown;
}
