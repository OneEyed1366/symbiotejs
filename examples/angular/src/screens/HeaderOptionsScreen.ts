import { Component, type Signal } from '@angular/core';
import { SafeAreaView, Text, View } from '@symbiote-native/angular';
import { injectRoute } from '@symbiote-native/navigation/angular';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/angular';
import type { ISearchBarCommands, IRoute } from '@symbiote-native/navigation';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';

type IHeaderOptionsParams = {
  lastHeaderAction?: string;
  lastSearchText?: string;
  lastSearchSubmitted?: string;
  lastSearchBarEvent?: string;
};

function isHeaderOptionsParams(value: unknown): value is IHeaderOptionsParams {
  return typeof value === 'object' && value !== null;
}

// headerSearchBarOptions.ref (SearchBarCommands: focus/blur/clearText/setText/cancelSearch/
// toggleCancelButton) lives on the OPTIONS object, resolved by Stack itself — a different scope
// than HeaderOptionsScreen below. A module-scope plain ref object (Angular has no `createRef`
// primitive of its own — see screen.directive.ts's IAngularSearchBarOptions comment) is what lets
// both share the SAME stable ref: the options resolver hands it to the navigator, the screen
// component's buttons read it back to drive the search bar imperatively.
const searchBarRef: { current: ISearchBarCommands | null } = { current: null };

// Registered on the root Stack's <ng-template symbioteScreen [options]="headerOptionsScreenOptions">
// (App.ts) - a resolver function (not a plain object) so its bar-button/menu press handlers can
// close over the LIVE navigation handle and round-trip the pressed action back onto the route via
// setParams(), which HeaderOptionsScreen below then reads via injectRoute() to display. Twin of
// ../../react/screens/HeaderOptionsScreen.tsx's headerOptionsScreenOptions.
export const headerOptionsScreenOptions: IScreenOptionsResolver = ({ navigation }) => ({
  title: 'Header Options',
  headerShown: true,
  headerTranslucent: true,
  headerLargeTitle: true,
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerLargeStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  headerLeftBarButtonItems: [
    {
      type: 'button',
      title: 'Info',
      onPress: () => navigation.setParams({ lastHeaderAction: 'left bar button: Info' }),
    },
  ],
  headerRightBarButtonItems: [
    {
      type: 'menu',
      title: 'More',
      menu: {
        title: 'Actions',
        items: [
          {
            type: 'action',
            title: 'Share',
            onPress: () => navigation.setParams({ lastHeaderAction: 'menu: Share' }),
          },
          {
            type: 'action',
            title: 'Delete',
            destructive: true,
            onPress: () => navigation.setParams({ lastHeaderAction: 'menu: Delete' }),
          },
        ],
      },
    },
  ],
  headerSearchBarOptions: {
    placeholder: 'Search demo…',
    autoCapitalize: 'none',
    placement: 'automatic',
    ref: searchBarRef,
    barTintColor: '#13243a',
    textColor: '#ffffff',
    tintColor: LINE_COLOR.presentation,
    hintTextColor: '#41506a',
    headerIconColor: LINE_COLOR.presentation,
    onChangeText: text => navigation.setParams({ lastSearchText: text }),
    onSearchButtonPress: text => navigation.setParams({ lastSearchSubmitted: text }),
    onFocus: () => navigation.setParams({ lastSearchBarEvent: 'focused' }),
    onBlur: () => navigation.setParams({ lastSearchBarEvent: 'blurred' }),
    onCancelButtonPress: () => navigation.setParams({ lastSearchBarEvent: 'cancel pressed' }),
    onClose: () => navigation.setParams({ lastSearchBarEvent: 'closed (Android)' }),
    onOpen: () => navigation.setParams({ lastSearchBarEvent: 'opened (Android)' }),
  },
});

/**
 * Header options demo: exercises headerLargeTitle, headerTintColor/headerStyle.backgroundColor,
 * a left bar button and a right bar-button MENU (both routed through setParams, see above), and
 * the full headerSearchBarOptions surface - every event callback, plus the imperative
 * SearchBarCommands ref driven by the buttons below (no need to pull down manually to prove it).
 * Angular twin of ../../react/screens/HeaderOptionsScreen.tsx - reads its route via injectRoute()
 * (a live Signal), exactly like the React screen ignores its props in favor of injectRoute().
 */
@Component({
  selector: 'HeaderOptionsScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <View class="section">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">HD</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Header options</Text>
            <Text class="hero-body">
              Bar buttons, a right-side menu, a native search bar, and headerLargeTitle — every
              headerSearchBarOptions callback wired to a live control below.
            </Text>
          </View>
        </View>
        <Text class="info-text">
          headerLargeTitle · headerTintColor · headerStyle.backgroundColor
        </Text>
        <Text testID="header-last-action" class="info-text">
          {{ 'last header action: ' + lastHeaderAction() }}
        </Text>
        <Text testID="header-search-text" class="info-text">
          {{ 'last search text: ' + lastSearchText() }}
        </Text>
        <Text testID="header-search-submitted" class="info-text">
          {{ 'last search submitted: ' + lastSearchSubmitted() }}
        </Text>
        <Text testID="header-search-event" class="info-text">
          {{ 'last search bar event: ' + lastSearchBarEvent() }}
        </Text>
        <Text class="note-text">
          Pull down to reveal the search bar (headerSearchBarOptions), or use the buttons below to
          drive it imperatively through its SearchBarCommands ref.
        </Text>
        <ActionButton
          testID="search-bar-focus"
          title="Focus search bar"
          (press)="onFocusSearchBar()"
          [color]="lineColorPresentation"
        ></ActionButton>
        <ActionButton
          testID="search-bar-set-text"
          title="Set text: preset value"
          (press)="onSetSearchBarText()"
          [color]="lineColorPresentation"
        ></ActionButton>
        <ActionButton
          testID="search-bar-clear"
          title="Clear search"
          (press)="onClearSearchBar()"
          [color]="lineColorPresentation"
        ></ActionButton>
        <ActionButton
          testID="search-bar-cancel"
          title="Cancel search"
          (press)="onCancelSearchBar()"
          [color]="lineColorPresentation"
        ></ActionButton>
      </View>
    </SafeAreaView>
  `,
})
export class HeaderOptionsScreen {
  private readonly liveRoute: Signal<IRoute<unknown>>;

  readonly lineColorPresentation = LINE_COLOR.presentation;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.presentation };

  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.HeaderOptions];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;

  constructor() {
    this.liveRoute = injectRoute();
  }

  private get params(): IHeaderOptionsParams {
    const value = this.liveRoute().params;
    return isHeaderOptionsParams(value) ? value : {};
  }

  lastHeaderAction(): string {
    return this.params.lastHeaderAction ?? 'none yet — tap a bar button or menu item';
  }

  lastSearchText(): string {
    return this.params.lastSearchText ?? 'none yet — pull down and type';
  }

  lastSearchSubmitted(): string {
    return this.params.lastSearchSubmitted ?? 'none yet — type and press search';
  }

  lastSearchBarEvent(): string {
    return this.params.lastSearchBarEvent ?? 'none yet — focus/blur/cancel the search bar';
  }

  onFocusSearchBar(): void {
    searchBarRef.current?.focus();
  }

  onSetSearchBarText(): void {
    searchBarRef.current?.setText('preset value');
  }

  onClearSearchBar(): void {
    searchBarRef.current?.clearText();
  }

  onCancelSearchBar(): void {
    searchBarRef.current?.cancelSearch();
  }
}
