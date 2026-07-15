import { defineComponent, ref } from 'vue';
import { SafeAreaView, Text, View } from '@symbiote-native/vue';
import { useRoute } from '@symbiote-native/navigation/vue';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/vue';
import type { ISearchBarCommands } from '@symbiote-native/navigation';
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
// toggleCancelButton) lives on the OPTIONS object, resolved by the Stack itself — a different
// scope than HeaderOptionsScreen below. Module-scope `ref(null)` (not a component's own ref) is
// what lets both share the SAME stable ref object: the options resolver hands it to the
// navigator, the screen component's buttons read it back to drive the search bar imperatively.
// Fine for a single demo screen instance; a multi-instance screen would need the ref threaded
// through some other shared owner instead.
const searchBarRef = ref<ISearchBarCommands | null>(null);

// Registered on the root Stack.Screen (App.tsx) as `options={headerOptionsScreenOptions}` — a
// resolver function (not a plain object) so its bar-button/menu onPress handlers can close over
// the LIVE navigation handle and round-trip the pressed action back onto the route via
// setParams(), which HeaderOptionsScreen below then reads via useRoute() to display.
export const headerOptionsScreenOptions: IScreenOptionsResolver = ({ navigation }) => ({
  title: 'Header Options',
  headerShown: true,
  headerTranslucent: true,
  headerLargeTitle: true,
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  // headerStyle.backgroundColor only colors the collapsed/compact header — react-native-screens
  // tracks the large-title (scroll-edge) appearance separately, defaulting to system white if
  // left unset. Same color as headerStyle so the header reads as one continuous dark bar
  // whether the large title is expanded or collapsed.
  headerLargeStyle: { backgroundColor: '#0b1622' },
  // System chrome bundled into the header (the search field's own blur/backdrop, chiefly)
  // follows this OS-level trait rather than any individual color prop above — left
  // 'unspecified' it renders as a stray light band regardless of headerStyle/headerLargeStyle.
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
    // Left unset, the search field defaults to a light/system background — a stark white
    // band against this screen's dark theme (its container tint follows headerStyle fine, only
    // the FIELD itself doesn't). barTintColor is the field's own bg (iOS); textColor/tintColor
    // are the typed text + cursor/Cancel-button tint; hintTextColor/headerIconColor are the
    // Android-only twins, harmless to set here too.
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
 * the full headerSearchBarOptions surface — every event callback, plus the imperative
 * SearchBarCommands ref driven by the buttons below (no need to pull down manually to prove it).
 */
export const HeaderOptionsScreen = defineComponent(
  () => {
    const route = useRoute();
    return () => {
      const params = isHeaderOptionsParams(route.value.params) ? route.value.params : {};
      const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.HeaderOptions];
      return (
        <SafeAreaView class="screen">
          <View class="section">
            <View class={`line-tag line-tag-${lineInfo.line}`}>
              <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
            </View>
            <View class="hero-card">
              <View class="hero-badge" style={{ backgroundColor: LINE_COLOR.presentation }}>
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
              {`last header action: ${params.lastHeaderAction ?? 'none yet — tap a bar button or menu item'}`}
            </Text>
            <Text testID="header-search-text" class="info-text">
              {`last search text: ${params.lastSearchText ?? 'none yet — pull down and type'}`}
            </Text>
            <Text testID="header-search-submitted" class="info-text">
              {`last search submitted: ${params.lastSearchSubmitted ?? 'none yet — type and press search'}`}
            </Text>
            <Text testID="header-search-event" class="info-text">
              {`last search bar event: ${params.lastSearchBarEvent ?? 'none yet — focus/blur/cancel the search bar'}`}
            </Text>
            <Text class="note-text">
              Pull down to reveal the search bar (headerSearchBarOptions), or use the buttons below to
              drive it imperatively through its SearchBarCommands ref.
            </Text>
            <ActionButton
              testID="search-bar-focus"
              title="Focus search bar"
              onPress={() => searchBarRef.value?.focus()}
              color={LINE_COLOR.presentation}
            />
            <ActionButton
              testID="search-bar-set-text"
              title="Set text: preset value"
              onPress={() => searchBarRef.value?.setText('preset value')}
              color={LINE_COLOR.presentation}
            />
            <ActionButton
              testID="search-bar-clear"
              title="Clear search"
              onPress={() => searchBarRef.value?.clearText()}
              color={LINE_COLOR.presentation}
            />
            <ActionButton
              testID="search-bar-cancel"
              title="Cancel search"
              onPress={() => searchBarRef.value?.cancelSearch()}
              color={LINE_COLOR.presentation}
            />
          </View>
        </SafeAreaView>
      );
    };
  },
  { name: 'HeaderOptionsScreen' },
);
