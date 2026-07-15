import { defineComponent } from 'vue';
import { ScrollView, Text, View } from '@symbiote-native/vue';
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import type { IScreenOptions } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';

// Registered on the root Stack.Screen (App.tsx) — a plain options object is enough here (unlike
// HeaderOptionsScreen's resolver) since none of these fields need the live navigation handle.
export const sheetDemoScreenOptions: IScreenOptions = {
  title: 'Sheet Demo',
  headerShown: true,
  // NOT translucent, unlike every other screen's headerStyle: formSheet has its own separate
  // header-height accounting in react-native-screens (RNSScreenContentWrapper's
  // headerHeightErrata walk). An opaque headerStyle still gets a dark, on-theme bar without
  // touching that formSheet sizing path.
  //
  // headerTranslucent was originally suspected as the cause of the sheet's content rendering
  // blank/translucent-with-nothing-on-top — but that same symptom persisted with headerTranslucent
  // left unset, which ruled it out. The real cause was stack.ts's RNSScreenContentWrapper style:
  // it hardcoded `{ flex: 1 }` for every presentation, but react-native-screens' own
  // ScreenStackItem.tsx never does that for formSheet (see resolveScreenContentWrapperStyle in
  // core/render-stack.ts) — `flex: 1` (`bottom: 0`) forces React to set a strict frame on every
  // native shadow-state update during a detent drag, which is the visible flicker PR #1870 fixed
  // by switching formSheet to `absoluteWithNoBottom` instead (sized bottom-up from content). The
  // screen below wraps its content in a ScrollView specifically because of that: react-native-
  // screens' own native fix for "content should still fill a taller detent" only resizes a
  // ScrollView child directly (RNSScreenContentWrapper.mm's
  // coerceChildScrollViewComponentSizeToSize), bypassing Yoga/flex entirely — a plain View would
  // stay sized to its own content and leave a plain-background gap below it on the 60%/100%
  // detents. The ScrollView must be the FIRST direct child of RNSScreenContentWrapper for that
  // native search to find it (childRCTScrollViewComponentAndContentContainer walks
  // self.subviews, or — iOS 26+ only — one level into react-native-screens' OWN internal
  // RNSSafeAreaViewComponentView) — an app-level SafeAreaView (react-native-safe-area-context's
  // unrelated native class) in between hides the ScrollView from that search entirely, so this
  // screen skips SafeAreaView on purpose, unlike every other demo screen.
  headerTintColor: LINE_COLOR.presentation,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
  stackPresentation: 'formSheet',
  sheetAllowedDetents: [0.3, 0.6, 1],
  sheetGrabberVisible: true,
  sheetCornerRadius: 20,
  sheetInitialDetentIndex: 0,
};

/**
 * Sheet presentation demo: this screen is PUSHED with stackPresentation: 'formSheet' and three
 * sheetAllowedDetents (30% / 60% / full height) — drag the grabber between them. "Present" is the
 * Menu screen's push onto this route; "Dismiss" below is this route's own pop, both driving the
 * native sheet the same way a real app would toggle it from a button.
 */
export const SheetDemoScreen = defineComponent(
  () => {
    const navigation = useStackNavigation();
    return () => {
      const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SheetDemo];
      return (
        <ScrollView class="screen" contentContainerStyle="section">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: LINE_COLOR.presentation }}>
              <Text class="hero-badge-text">SH</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Sheet presentation</Text>
              <Text class="hero-body">
                Pushed with stackPresentation: formSheet and three detents — drag the grabber between
                30%, 60%, and full height.
              </Text>
            </View>
          </View>
          <Text class="info-text">
            stackPresentation: formSheet · detents 30% / 60% / 100% · drag the grabber
          </Text>
          <ActionButton
            testID="sheet-dismiss"
            title="Dismiss"
            onPress={() => navigation.value.pop()}
            color={LINE_COLOR.presentation}
          />
        </ScrollView>
      );
    };
  },
  { name: 'SheetDemoScreen' },
);
