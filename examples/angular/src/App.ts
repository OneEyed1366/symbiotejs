/**
 * Symbiote canary app entry: composes the native stack navigator
 * (@symbiote-native/navigation/angular, driven by react-native-screens' RNSScreen/
 * RNSScreenStack native views) over the full demo screen surface. Menu is the initial
 * route — a menu of buttons, one per navigator/feature @symbiote-native/navigation exports;
 * Canary is unchanged and reachable from the menu's first row. Details has no menu row of its
 * own — it's the DeepLinking demo's resolution target (symbiotecanaryangular://details/:id),
 * reached only through that tour stop. The actual canary surface (every
 * @symbiote-native/angular primitive) lives in ./screens/CanaryScreen; the demo sections it
 * renders live under ./components. Angular twin of ../react/App.tsx.
 *
 * @format
 */

import {
  AfterViewInit,
  Component,
  Injector,
  OnInit,
  ViewChild,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { Stack, ScreenDirective, injectLinkingIntegration } from '@symbiote-native/navigation/angular';
import type { IAngularScreenOptions } from '@symbiote-native/navigation/angular';
import { hide } from '@symbiote-native/splash-screen/angular';
import { MenuScreen } from './screens/MenuScreen';
import { CanaryScreen } from './screens/CanaryScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import { HeaderOptionsScreen, headerOptionsScreenOptions } from './screens/HeaderOptionsScreen';
import { SheetDemoScreen, sheetDemoScreenOptions } from './screens/SheetDemoScreen';
import { TabsDemoScreen } from './screens/TabsDemoScreen';
import { DrawerDemoScreen } from './screens/DrawerDemoScreen';
import { NestedNavigatorsScreen } from './screens/NestedNavigatorsScreen';
import { HooksDemoScreen } from './screens/HooksDemoScreen';
import { DeepLinkingScreen } from './screens/DeepLinkingScreen';
import { StatePersistenceScreen } from './screens/StatePersistenceScreen';
import { APP_LINKING_CONFIG } from './navigation-linking';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';
// Static look lives in App.css — a plain global .css file, compiled at build time by
// @symbiote-native/css-parser and resolved at runtime through the shared style registry every
// adapter's class/className/addClass path shares.
import './App.css';

const DARK_HEADER_STYLE = { backgroundColor: '#0b1622' } as const;

@Component({
  selector: 'symbiote-angular-app',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack #nav initialRouteName="Menu">
      <ng-template symbioteScreen name="Menu" [component]="menuScreen" [options]="menuOptions"></ng-template>
      <ng-template symbioteScreen name="Canary" [component]="canaryScreen" [options]="canaryOptions"></ng-template>
      <ng-template symbioteScreen name="Details" [component]="detailsScreen" [options]="detailsOptions"></ng-template>
      <ng-template symbioteScreen name="HeaderOptions" [component]="headerOptionsScreen" [options]="headerOptionsOptions"></ng-template>
      <ng-template symbioteScreen name="SheetDemo" [component]="sheetDemoScreen" [options]="sheetDemoOptions"></ng-template>
      <ng-template symbioteScreen name="TabsDemo" [component]="tabsDemoScreen" [options]="tabsDemoOptions"></ng-template>
      <ng-template symbioteScreen name="DrawerDemo" [component]="drawerDemoScreen" [options]="drawerDemoOptions"></ng-template>
      <ng-template symbioteScreen name="NestedNavigators" [component]="nestedNavigatorsScreen" [options]="nestedNavigatorsOptions"></ng-template>
      <ng-template symbioteScreen name="HooksDemo" [component]="hooksDemoScreen" [options]="hooksDemoOptions"></ng-template>
      <ng-template symbioteScreen name="DeepLinking" [component]="deepLinkingScreen" [options]="deepLinkingOptions"></ng-template>
      <ng-template symbioteScreen name="StatePersistence" [component]="statePersistenceScreen" [options]="statePersistenceOptions"></ng-template>
    </Stack>
  `,
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('nav') private readonly nav!: Stack;
  private readonly injector = inject(Injector);

  readonly menuScreen = MenuScreen;
  readonly canaryScreen = CanaryScreen;
  readonly detailsScreen = DetailsScreen;
  readonly headerOptionsScreen = HeaderOptionsScreen;
  readonly sheetDemoScreen = SheetDemoScreen;
  readonly tabsDemoScreen = TabsDemoScreen;
  readonly drawerDemoScreen = DrawerDemoScreen;
  readonly nestedNavigatorsScreen = NestedNavigatorsScreen;
  readonly hooksDemoScreen = HooksDemoScreen;
  readonly deepLinkingScreen = DeepLinkingScreen;
  readonly statePersistenceScreen = StatePersistenceScreen;

  readonly menuOptions: IAngularScreenOptions = {
    title: 'Navigation Demos',
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly canaryOptions: IAngularScreenOptions = {
    title: 'Symbiote Canary',
    headerShown: true,
    headerTranslucent: true,
    headerTintColor: LINE_COLOR.primitives,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly detailsOptions: IAngularScreenOptions = {
    title: 'Navigation Demo',
    headerTranslucent: true,
    headerTintColor: LINE_COLOR.primitives,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
    // Edge-flicker investigation experiment (see ../react/App.tsx's matching comment): 'default'
    // resolved to an ~480ms native transition (measured via dlog). Explicit values here to check
    // whether pinning stackAnimation/transitionDuration changes the artifact's presence/character.
    stackAnimation: 'slide_from_right',
    transitionDuration: 300,
  };

  readonly headerOptionsOptions = headerOptionsScreenOptions;
  readonly sheetDemoOptions = sheetDemoScreenOptions;

  readonly tabsDemoOptions: IAngularScreenOptions = {
    title: 'Tabs Demo',
    headerShown: true,
    headerTintColor: LINE_COLOR.structure,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly drawerDemoOptions: IAngularScreenOptions = {
    title: 'Drawer Demo',
    headerShown: true,
    headerTintColor: LINE_COLOR.structure,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly nestedNavigatorsOptions: IAngularScreenOptions = {
    title: 'Nested Navigators',
    headerShown: true,
    headerTintColor: LINE_COLOR.structure,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly hooksDemoOptions: IAngularScreenOptions = {
    title: 'Hooks Demo',
    headerShown: true,
    headerTintColor: LINE_COLOR.introspection,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly deepLinkingOptions: IAngularScreenOptions = {
    title: 'Deep Linking',
    headerShown: true,
    headerTintColor: LINE_COLOR.routing,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  readonly statePersistenceOptions: IAngularScreenOptions = {
    title: 'State Persistence',
    headerShown: true,
    headerTintColor: LINE_COLOR.routing,
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: DARK_HEADER_STYLE,
    headerUserInterfaceStyle: 'dark',
  };

  ngOnInit(): void {
    hide();
  }

  // injectLinkingIntegration needs `inject(DestroyRef)`, so it must run inside an injection
  // context - plain lifecycle-hook bodies aren't one (only field initializers/constructors are),
  // hence runInInjectionContext. `nav` (the Stack component instance itself, which implements
  // INavigatorHandle directly) is already stable by the time @ViewChild resolves it, so
  // ngAfterViewInit - the first hook Angular guarantees @ViewChild queries are populated - is the
  // earliest safe call site. Angular's own twin of React's App.tsx LinkingRunner-mounted-once-handle-is-real
  // dance: there, a plain ref only attaches during commit, so a child component gates the hook call
  // until a non-null handle exists; here @ViewChild + runInInjectionContext achieves the same gating
  // without needing a second component.
  ngAfterViewInit(): void {
    runInInjectionContext(this.injector, () => {
      injectLinkingIntegration(APP_LINKING_CONFIG, this.nav);
    });
  }
}
