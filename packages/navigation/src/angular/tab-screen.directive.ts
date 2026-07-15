// [symbioteTabScreen]: Tab's twin of screen.directive.ts's ScreenDirective - a declarative marker
// read via @ContentChildren to build the static name -> {component, options} registry, then Tab
// mounts the FOCUSED route's component itself. Mirrors react/tab-screen.ts's TabScreen minus the
// stack-only concepts (no push/pop lifecycle events to wire).

import { Directive, Input, type Type } from '@angular/core';
import type { IRoute, ITabOptions } from '../core';
import type { ITabNavigatorHandle } from '../core';

export type ITabScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

export type ITabScreenOptionsResolver = (props: ITabScreenOptionsArgs) => ITabOptions;

@Directive({
  selector: 'ng-template[symbioteTabScreen]',
  standalone: true,
})
export class TabScreenDirective {
  @Input({ required: true }) name!: string;
  @Input({ required: true }) component!: Type<unknown>;
  @Input() options?: ITabOptions | ITabScreenOptionsResolver;
  @Input() initialParams?: unknown;
}
