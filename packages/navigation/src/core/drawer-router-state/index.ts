// DrawerRouter: the logic half (framework-agnostic, zero render), sibling to navigator-state.ts
// and tab-router-state.ts. Unlike the stack's push/pop route array, a drawer's route list is
// FIXED at mount (one entry per declared <Drawer.Screen>, collected by the adapter exactly like
// Stack's/Tab's collectRegistry) - the reducer only tracks which one is focused (`index`) and
// whether the drawer panel is open. Route identity/shape is `IRoute`, reused verbatim from
// navigator-state.ts (same convention tab-router-state.ts follows) so all three navigators share
// one route shape.

import type { IRoute } from '../navigator-state';

export type { IRoute } from '../navigator-state';

type IRouteEntry = IRoute<unknown>;

export type IDrawerRouterState = Readonly<{
  routes: readonly IRouteEntry[];
  index: number;
  isOpen: boolean;
}>;

export type IDrawerRouterAction =
  | { type: 'jumpTo'; name: string }
  | { type: 'openDrawer' }
  | { type: 'closeDrawer' }
  | { type: 'toggleDrawer' };

const INITIAL_FOCUSED_INDEX = 0;

export function createInitialDrawerRouterState(
  routes: readonly IRouteEntry[],
  initialRouteName?: string,
): IDrawerRouterState {
  if (initialRouteName === undefined) {
    return { routes, index: INITIAL_FOCUSED_INDEX, isOpen: false };
  }
  const index = routes.findIndex(route => route.name === initialRouteName);
  return { routes, index: index === -1 ? INITIAL_FOCUSED_INDEX : index, isOpen: false };
}

// Mirrors @react-navigation/drawer's DrawerActions: jumpTo focuses a route by NAME (TabRouter's
// own convention, not the stack's by-key popTo) AND closes the drawer - selecting a destination
// is itself the dismissal gesture, so a plain focus without also closing would leave the panel
// covering the just-selected screen.
export function drawerRouterReducer(
  state: IDrawerRouterState,
  action: IDrawerRouterAction,
): IDrawerRouterState {
  switch (action.type) {
    case 'jumpTo': {
      const index = state.routes.findIndex(route => route.name === action.name);
      if (index === -1) return state;
      return index === state.index && !state.isOpen ? state : { ...state, index, isOpen: false };
    }

    case 'openDrawer':
      return state.isOpen ? state : { ...state, isOpen: true };

    case 'closeDrawer':
      return state.isOpen ? { ...state, isOpen: false } : state;

    case 'toggleDrawer':
      return { ...state, isOpen: !state.isOpen };

    default:
      return state;
  }
}

export function focusedDrawerRoute(state: IDrawerRouterState): IRouteEntry | undefined {
  return state.routes[state.index];
}
