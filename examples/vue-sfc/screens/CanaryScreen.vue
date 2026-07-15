<!--
  The Vue canary, as a multi-file SFC — now the "Primitives" tour stop of the
  @symbiote-native/navigation demo suite (route ROUTE_NAME.Canary), reached by pushing from
  MenuScreen.vue; it used to BE the app's whole root (App.vue), moved one level deeper into the
  nav tree without losing any of its own behavior — see the `symbiote-dev-examples` /
  `<examples_vs_dot_examples>` port note in the navigation-lines.ts/App.css headers for why.
  Metro compiles every .vue through metro-vue-transformer.js (parse → compileScript+
  inlineTemplate → 'vue'→@vue/runtime-core), so authoring is ordinary Vue — <template> +
  <script setup> — while every vnode still recommits through @symbiote-native/engine into
  Fabric, React Native's renderer never in the path.

  This is the FULL "all primitives" canary, the SFC twin of examples/vue-tsx/App.tsx and
  examples/react/screens/CanaryScreen.tsx: the root SafeAreaView → ScrollView composition lives
  here; the 8 demos (Animated, AnimatedParity, NativeModules, RefApi, PlatformColor, Accessibility,
  Responder, Parity) are each their own SFC under ../components, composed below in the same order
  as the TSX root. Same engine, same components, same palette (App.css's global registry — see
  below); the ONLY visual difference vs the React and TSX canaries is the "Primitives" line's
  brand color (Vue's green, LINE_COLOR.primitives).

  No local <style> block here on purpose: every class this screen references already lives in
  App.css's global registry, ported byte-identical from .examples/react/App.css (see that file's
  header) — a second, locally-scoped copy would only drift out of sync with it, which is exactly
  what happened before this screen was brought back to parity. Same pattern as
  DrawerHomeScreen.vue / StatePersistenceScreen.vue.

  Non-template constructs handled the SFC way: RefreshControl is element-valued, so it is built in
  script via a computed h() and bound (:refresh-control); Animated.View / Animated.ScrollView are
  dotted, so they are aliased to <AnimatedView> / <AnimatedScrollView>; FlatList renders its cell
  through the #item scoped slot; Pressable's children take the press state through a scoped slot
  (#default="{ pressed }").
-->
<script setup lang="ts">
import { ref, shallowRef, computed, h, onMounted, onUnmounted } from 'vue';
import {
  View,
  Text,
  Animated,
  ScrollView,
  TextInput,
  Image,
  Switch,
  ActivityIndicator,
  Pressable,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  SafeAreaView,
  RefreshControl,
  StatusBar,
  Keyboard,
  KEYBOARD_EVENT,
  Platform,
  StyleSheet,
  PixelRatio,
  useWindowDimensions,
  useColorScheme,
  AppState,
  Alert,
  ActionSheetIOS,
  Linking,
  Vibration,
  Share,
  createTunnel,
  type ISymbioteEvent,
  type IHostInstance,
} from '@symbiote-native/vue';
// A third-party native view via symbiote's own wrapper (not the library's React component); the
// engine derives RNCSlider's events + tint processors from its ViewConfig. Same wrapper as React.
import { Slider } from '@symbiote-native/slider/vue';

import ActionButton from '../components/ActionButton.vue';
import AnimatedDemo from '../components/AnimatedDemo.vue';
import AnimatedParityDemo from '../components/AnimatedParityDemo.vue';
import NativeModulesDemo from '../components/NativeModulesDemo.vue';
import RefApiDemo from '../components/RefApiDemo.vue';
import PlatformColorDemo from '../components/PlatformColorDemo.vue';
import AccessibilityDemo from '../components/AccessibilityDemo.vue';
import ResponderDemo from '../components/ResponderDemo.vue';
import ParityDemo from '../components/ParityDemo.vue';
import { nativeNumber } from '../components/event-utils';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const AnimatedView = Animated.View;
const AnimatedScrollView = Animated.ScrollView;

const CHIP_WIDTH = 72;
const CHIP_GAP = 12;
const REFRESH_MS = 2000;

const chips = Array.from({ length: 24 }, (_unused, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}));

// A module-level singleton (not created inside setup) — the whole point of createTunnel is
// that its In/Out don't need to share a component instance, only this store. Destructured to
// PascalCase so the SFC compiler auto-registers them as usable template tags.
const overlayTunnel = createTunnel();
const { In: TunnelIn, Out: TunnelOut } = overlayTunnel;

// This screen's own "you are here" wayfinding pill, the same one every other tour stop carries
// (see MenuScreen.vue's ROUTE_LINE_INFO badges) — the one addition vs. the pre-navigation canary,
// everything else below is the relocated content unchanged.
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];

const count = ref(0);
const name = ref('');
const spinning = ref(true);
const volume = ref(0.5);
const modalVisible = ref(false);
const toastVisible = ref(false);
const tunnelToastVisible = ref(false);
// shallowRef, NOT ref: the engine node must be held by IDENTITY so Teleport's `to` target
// stays the real host node, not wrapped in a reactive Proxy (vue-adapter-reactivity Gotcha 1).
const overlayHost = shallowRef<IHostInstance | null>(null);
const refreshing = ref(false);
const refreshes = ref(0);
const keyboardHeight = ref(0);
const statusBarHidden = ref(false);
const darkStatusBar = ref(false);
// #6 Android-only StatusBar window flags: the blank-risk pair (device-verify-pending).
const statusBarRed = ref(false);
const statusBarTranslucent = ref(false);

// Feature-parity device checks: state for the cluster before the final logo.
const retentionMove = ref({ dx: 0, dy: 0 });
const mvcpItems = ref(
  Array.from({ length: 20 }, (_value, index) => ({
    id: `row-${index}`,
    label: `item ${index}`,
  })),
);
let mvcpHead = 0;
// native-driver scroll value: Animated.event attaches it on the UI thread, so the
// header opacity/translateY are driven without a JS frame per scroll tick.
const parityScrollY = new Animated.Value(0);
const parityHeaderOpacity = parityScrollY.interpolate({
  inputRange: [0, 120],
  outputRange: [1, 0.12],
  extrapolate: 'clamp',
});
const parityHeaderTranslateY = parityScrollY.interpolate({
  inputRange: [0, 120],
  outputRange: [0, -16],
  extrapolate: 'clamp',
});
const onParityScroll = Animated.event(
  [{ nativeEvent: { contentOffset: { y: parityScrollY } } }],
  { useNativeDriver: true },
);
const kavEnabled = ref(true);

// 0..5, so the keyed v-for matches the TSX's index-keyed Array.from(length: 6).
const scrollRows = Array.from({ length: 6 }, (_value, index) => index);

// Tier B runtime modules, read live: the composables pull from Dimensions/Appearance,
// appState tracks foreground/background through AppState's device events.
const window = useWindowDimensions();
const colorScheme = useColorScheme();
const appState = ref<string>(AppState.currentState ?? 'unknown');

// Native launch screen: hide() now lives once at the root (App.vue's own onMounted), not here —
// this screen isn't the first thing mounted anymore (Menu is the initial route), so hiding it
// from here would be too late (or, once a user navigates back to Canary a second time, wrong).

// native -> JS: the device hub pushes keyboard frames; we read the height live.
let keyboardSubs: Array<{ remove(): void }> = [];
onMounted(() => {
  const onShow = (payload: unknown): void => {
    const height =
      typeof payload === 'object' &&
      payload !== null &&
      'endCoordinates' in payload &&
      typeof payload.endCoordinates === 'object' &&
      payload.endCoordinates !== null &&
      'height' in payload.endCoordinates &&
      typeof payload.endCoordinates.height === 'number'
        ? payload.endCoordinates.height
        : 0;
    keyboardHeight.value = height;
  };
  keyboardSubs = [
    Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
    Keyboard.addListener(KEYBOARD_EVENT.didHide, () => {
      keyboardHeight.value = 0;
    }),
  ];
});
onUnmounted(() => keyboardSubs.forEach(subscription => subscription.remove()));

// native -> JS: AppState pushes lifecycle changes; read the current phase live.
let appStateSub: { remove(): void } | undefined;
onMounted(() => {
  appStateSub = AppState.addEventListener('change', (...args: unknown[]) => {
    const next = args[0];
    if (typeof next === 'string') appState.value = next;
  });
});
onUnmounted(() => appStateSub?.remove());

const onRefresh = (): void => {
  refreshing.value = true;
  setTimeout(() => {
    refreshing.value = false;
    refreshes.value += 1;
  }, REFRESH_MS);
};

// The RefreshControl as an element-valued prop — Vue templates can't inline an element into a
// prop, so build the VNode in script and bind it; recomputes when `refreshing` flips.
const refreshControl = computed(() =>
  h(RefreshControl, {
    refreshing: refreshing.value,
    onRefresh,
    tintColor: LINE_COLOR.primitives,
  }),
);

// Tier A runtime modules, read live. A non-empty Version proves PlatformConstants resolved; a
// fractional hairline (e.g. 0.333 on @3x) proves DeviceInfo's scale resolved.
const hairlineText = computed(
  () =>
    `${Platform.OS} ${Platform.Version}` +
    `${Platform.isPad ? ' · iPad' : ''}` +
    ` · ${Platform.select({ ios: 'native ios', android: 'native android', default: '?' })}` +
    ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`,
);
// Real w×h@scale proves Dimensions + PixelRatio; a colorScheme proves Appearance; appState flips
// when you background the app (AppState's device events).
const dimensionsText = computed(
  () =>
    `${Math.round(window.value.width)}×${Math.round(window.value.height)} @${PixelRatio.get()}x` +
    ` · ${colorScheme.value ?? 'no-scheme'} · ${appState.value}`,
);

// JS->native StatusBar window flags (Android). setBackgroundColor/setTranslucent imperative drives.
const onToggleStatusBarRed = (): void => {
  const next = !statusBarRed.value;
  statusBarRed.value = next;
  StatusBar.setBackgroundColor(next ? '#ff0000' : '#101a2c', true);
};
const onToggleStatusBarTranslucent = (): void => {
  const next = !statusBarTranslucent.value;
  statusBarTranslucent.value = next;
  StatusBar.setTranslucent(next);
};

// JS -> native imperative modules. A Promise reject (no native module / user
// cancel) is expected, so it's swallowed; this is a demo, not a flow to handle.
const onShare = (): void => {
  void Share.share({
    message: 'Sent from symbiote',
    url: 'https://reactnative.dev',
  }).catch(() => {});
};
const onAlert = (): void => {
  Alert.alert('symbiote', 'Native AlertManager reached.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Vibrate', onPress: () => Vibration.vibrate() },
  ]);
};
const onActionSheet = (): void => {
  ActionSheetIOS.showActionSheetWithOptions(
    { options: ['Share', 'Vibrate', 'Cancel'], cancelButtonIndex: 2 },
    (index: number) => {
      if (index === 0) onShare();
      if (index === 1) Vibration.vibrate();
    },
  );
};
const onOpenUrl = (): void => {
  void Linking.openURL('https://reactnative.dev').catch(() => {});
};

const onRetentionMove = (event: ISymbioteEvent): void => {
  retentionMove.value = {
    dx: Math.round(nativeNumber(event, 'locationX')),
    dy: Math.round(nativeNumber(event, 'locationY')),
  };
};

// Horizontal FlatList: real windowing over 24 chips. The cell is the #item scoped slot.
const chipsKeyExtractor = (item: {
  id: string;
  index: number;
  color: string;
}): string => item.id;
const chipsGetItemLayout = (
  _data: unknown,
  index: number,
): { length: number; offset: number; index: number } => ({
  length: CHIP_WIDTH + CHIP_GAP,
  offset: (CHIP_WIDTH + CHIP_GAP) * index,
  index,
});

// maintainVisibleContentPosition list: prepend without jump.
const mvcpKeyExtractor = (item: { id: string; label: string }): string =>
  item.id;
const onPrepend = (): void => {
  mvcpHead -= 5;
  const head = mvcpHead;
  const prepended = Array.from({ length: 5 }, (_value, index) => {
    const n = head + index;
    return { id: `row-${n}`, label: `item ${n}` };
  });
  mvcpItems.value = [...prepended, ...mvcpItems.value];
};

// Native-driver proof for Animated.event: JAM the JS thread 3s, then drag the box during the
// freeze. If the bar keeps fading/lifting while JS is frozen, the scroll drives parityScrollY on
// the UI thread (native attach); if it sticks until the thread frees, it was JS-driven.
const freezeJs3s = (): void => {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    // Intentionally block the JS thread: no JS frame can run here, so any header motion during
    // the freeze must be coming from the native driver.
  }
};

// Pressable's `style` prop is a FUNCTION of press state (RN's own idiom, mirrored by
// @symbiote-native/vue's Pressable) — the static look lives in .pressable-card / .retention-card
// (App.css's global registry); only the press-state-dependent colors stay a style function.
const pressableStyle = ({ pressed }: { pressed: boolean }) => ({
  backgroundColor: pressed ? '#0b1622' : '#13243a',
  borderColor: LINE_COLOR.primitives,
});
const retentionStyle = ({ pressed }: { pressed: boolean }) => ({
  backgroundColor: pressed ? LINE_COLOR.primitives : '#13243a',
});

// Modern style props reaching Fabric's C++ parser, kept as dynamic style objects here (not CSS)
// only because these demos predate @symbiote-native/css-parser's `raw` passthrough for transform/
// box-shadow/filter/transform-origin (2026-07) — the CSS property itself now works identically
// (see .gradient-card below, authored via CSS) — legacy demo wiring, not a remaining gap.
const shadowCardExtra = {
  boxShadow: '0px 0px 22px 3px rgba(20,158,202,0.85)',
};
const dimStyle = { filter: [{ brightness: 0.5 }] };
const rotationStyle = {
  transformOrigin: 'top left',
  transform: [{ rotate: '4deg' }],
};
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView
      testID="canary-scroll"
      class="screen"
      content-container-style="scroll-content"
      :refresh-control="refreshControl"
    >
      <!-- JS->native: StatusBar renders nothing; it drives the iOS status bar imperatively. -->
      <StatusBar
        :bar-style="darkStatusBar ? 'dark-content' : 'light-content'"
        :hidden="statusBarHidden"
        :animated="true"
      />
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{
          `${lineInfo.code} · ${lineInfo.label}`
        }}</Text>
      </View>
      <View class="hero-card">
        <View
          class="hero-badge"
          :style="{ backgroundColor: LINE_COLOR.primitives }"
        >
          <Text class="hero-badge-text">CN</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">All primitives</Text>
          <Text class="hero-body"
            >Every @symbiote-native/vue primitive, driven straight onto Fabric —
            no react-native renderer in the path.</Text
          >
        </View>
      </View>
      <!-- native->JS: keyboard height pushed from the device hub, read live -->
      <Text class="header-note">{{
        keyboardHeight > 0
          ? `keyboard up · ${keyboardHeight}px`
          : 'keyboard down'
      }}</Text>
      <!-- Tier A runtime modules, live. The border below IS the hairline. -->
      <Text
        class="hairline-note"
        :style="{ borderTopWidth: StyleSheet.hairlineWidth }"
        >{{ hairlineText }}</Text
      >
      <!-- Tier B runtime modules, live. -->
      <Text class="header-note">{{ dimensionsText }}</Text>

      <!-- JS->native StatusBar controls: watch the top strip react -->
      <View class="row">
        <View class="flex1">
          <ActionButton
            :title="statusBarHidden ? 'Show status bar' : 'Hide status bar'"
            :onPress="() => (statusBarHidden = !statusBarHidden)"
            :color="LINE_COLOR.primitives"
          />
        </View>
        <View class="flex1">
          <ActionButton
            :title="darkStatusBar ? 'Light text' : 'Dark text'"
            :onPress="() => (darkStatusBar = !darkStatusBar)"
            :color="LINE_COLOR.primitives"
          />
        </View>
      </View>
      <!-- #6 Android-only window flags: the blank-risk pair. PASS: the top strip turns
           red / goes translucent and the app STAYS rendered. -->
      <View v-if="Platform.OS === 'android'" class="row">
        <View class="flex1">
          <ActionButton
            :title="statusBarRed ? 'BG default' : 'BG red'"
            :onPress="onToggleStatusBarRed"
            :color="LINE_COLOR.primitives"
          />
        </View>
        <View class="flex1">
          <ActionButton
            :title="statusBarTranslucent ? 'Opaque' : 'Translucent'"
            :onPress="onToggleStatusBarTranslucent"
            :color="LINE_COLOR.primitives"
          />
        </View>
      </View>
      <!-- JS->native imperative modules: tap to fire the real native UI / haptics. -->
      <View class="row">
        <View class="flex1">
          <ActionButton
            title="Alert"
            :onPress="onAlert"
            :color="LINE_COLOR.primitives"
          />
        </View>
        <!-- ActionSheetIOS is iOS-only by design (no Android native module exists). -->
        <View v-if="Platform.OS !== 'android'" class="flex1">
          <ActionButton
            title="Action sheet"
            :onPress="onActionSheet"
            :color="LINE_COLOR.primitives"
          />
        </View>
      </View>
      <View class="row">
        <View class="flex1">
          <ActionButton
            title="Share"
            :onPress="onShare"
            :color="LINE_COLOR.primitives"
          />
        </View>
        <View class="flex1">
          <ActionButton
            title="Vibrate"
            :onPress="() => Vibration.vibrate()"
            :color="LINE_COLOR.primitives"
          />
        </View>
      </View>
      <ActionButton
        title="Open reactnative.dev"
        :onPress="onOpenUrl"
        :color="LINE_COLOR.primitives"
      />

      <!-- The native UIRefreshControl spinner only shows while iOS holds the pull-down; our full
           re-commit snaps the offset back, so we drive our OWN indicator from `refreshing`. -->
      <View v-if="refreshing" class="refresh-row">
        <ActivityIndicator :color="LINE_COLOR.primitives" />
        <Text class="accent-note">Refreshing…</Text>
      </View>
      <Text v-else class="muted-center">{{
        `pull to refresh · refreshed ${refreshes}×`
      }}</Text>

      <!-- View + press-to-increment -->
      <View testID="counter-card" @press="count += 1" class="counter-card">
        <Text testID="counter-value" class="counter-text">{{
          `tapped ${count}×`
        }}</Text>
      </View>

      <!-- TextInput + greeting, via v-model (our resolveModelValue/emitModelUpdate shim) -->
      <TextInput
        testID="greeting-input"
        v-model="name"
        placeholder="type your name…"
        placeholder-text-color="#41506a"
        class="text-input"
      />
      <Text testID="greeting-output" class="greeting">{{
        name ? `Hello, ${name}` : 'Hello, stranger'
      }}</Text>

      <!-- Switch drives the ActivityIndicator, via v-model -->
      <View class="switch-row">
        <Text class="switch-label">spinner</Text>
        <Switch
          testID="spinner-switch"
          v-model="spinning"
          :track-color="{ false: '#334155', true: LINE_COLOR.primitives }"
        />
      </View>
      <ActivityIndicator
        testID="spinner-indicator"
        :animating="spinning"
        :color="LINE_COLOR.primitives"
        size="large"
      />

      <!-- Slider: the @react-native-community/slider native view via @symbiote-native/slider/vue. The
           engine derives its events + tint processors from the library's ViewConfig; same wrapper
           backs the React canary. -->
      <View class="section-tight">
        <Text class="switch-label">{{
          `volume · ${Math.round(volume * 100)}%`
        }}</Text>
        <Slider
          v-model="volume"
          :minimum-value="0"
          :maximum-value="1"
          :step="0.01"
          :minimum-track-tint-color="LINE_COLOR.primitives"
          maximum-track-tint-color="#334155"
          thumb-tint-color="#ffffff"
          class="slider"
        />
      </View>

      <!-- Animated: JS driver vs native driver, side by side -->
      <AnimatedDemo />

      <!-- Animated: ValueXY, tracking, diffClamp -->
      <AnimatedParityDemo />

      <!-- Runtime modules: I18nManager, Settings, Image statics -->
      <NativeModulesDemo />

      <!-- Imperative host-ref API: measure / setNativeProps / findNodeHandle -->
      <RefApiDemo />

      <!-- PlatformColor / DynamicColorIOS: native semantic + appearance-aware colors -->
      <PlatformColorDemo />

      <!-- Accessibility: a11y props to native, aria/role transform, AccessibilityInfo -->
      <AccessibilityDemo />

      <!-- Responder: drag-vs-tap + mid-gesture transfer (move-should-set / takeover) -->
      <ResponderDemo />

      <!-- Parity checks: longPress · Keyboard.dismiss · animated scroll · sticky · a11y focus -->
      <ParityDemo />

      <!-- Opens a Modal -->
      <ActionButton
        testID="modal-open"
        title="Open modal"
        :onPress="() => (modalVisible = true)"
        :color="LINE_COLOR.primitives"
      />

      <!-- Pressable's static look lives in .pressable-card; only the press-state-dependent
           colors stay a style function. Children take the press state through a scoped slot. -->
      <Pressable
        @press="count += 1"
        class="pressable-card"
        :style="pressableStyle"
      >
        <template #default="{ pressed }">
          <Text
            class="pressable-label"
            :style="{ color: pressed ? LINE_COLOR.primitives : '#cbd5e1' }"
            >{{ pressed ? 'holding…' : 'press me (also +1)' }}</Text
          >
        </template>
      </Pressable>

      <!-- Horizontal FlatList: real windowing. -->
      <Text class="section-label">FlatList · 24 chips, windowed</Text>
      <FlatList
        testID="chips-list"
        :data="chips"
        :horizontal="true"
        :key-extractor="chipsKeyExtractor"
        :get-item-layout="chipsGetItemLayout"
        class="chip-list"
      >
        <template #item="{ item }">
          <!-- width/marginRight stay dynamic — they reference the CHIP_WIDTH/CHIP_GAP script
               consts (also used by chipsGetItemLayout above), which a CSS selector has no way to
               read; backgroundColor is per-chip (item.color). -->
          <View
            class="chip-card"
            :style="{
              width: CHIP_WIDTH,
              marginRight: CHIP_GAP,
              backgroundColor: item.color,
            }"
          >
            <Text class="chip-number">{{ item.index }}</Text>
          </View>
        </template>
      </FlatList>

      <!-- ===== feature-parity device checks ===== -->

      <!-- Press-retention measured rect. PASS: press, then drag DOWN ~100px: the panel
           STAYS highlighted (inside the measured rect + 80px bottom retention). Drag UP
           off the top: highlight drops. Proves measured-rect retention rather than a
           symmetric-radius approximation. The dx/dy readout tracks the move offset. -->
      <!-- Pressable's static look lives in .retention-card; only the press-state-dependent
           background stays a style function. -->
      <Pressable
        :hit-slop="{ top: 0, bottom: 40, left: 0, right: 0 }"
        :press-retention-offset="{ top: 0, bottom: 80, left: 0, right: 0 }"
        @press-move="onRetentionMove"
        class="retention-card"
        :style="retentionStyle"
      >
        <Text class="info-text">{{
          `drag me · dx ${retentionMove.dx} · dy ${retentionMove.dy}`
        }}</Text>
      </Pressable>

      <!-- maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows
           you are looking at DO NOT jump; new items appear above without shifting the
           viewport. FAIL: the list jumps to the top. box-list160 is shared with the
           Animated.ScrollView below. -->
      <Text class="section-label">MVCP · prepend without jump</Text>
      <FlatList
        :data="mvcpItems"
        :key-extractor="mvcpKeyExtractor"
        :maintain-visible-content-position="{ minIndexForVisible: 0 }"
        class="box-list160"
      >
        <template #item="{ item }">
          <View class="mvcp-row">
            <Text class="list-row-text">{{ item.label }}</Text>
          </View>
        </template>
      </FlatList>
      <ActionButton
        title="Prepend 5"
        :color="LINE_COLOR.primitives"
        :onPress="onPrepend"
      />

      <!-- Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the
           box below (not the page): the bright bar above SMOOTHLY fades to near-invisible
           and lifts, on the UI thread (no jank, no per-frame JS). Proves Animated.ScrollView
           + Animated.event native attach. -->
      <AnimatedView
        class="parity-header"
        :style="{
          opacity: parityHeaderOpacity,
          transform: [{ translateY: parityHeaderTranslateY }],
        }"
      >
        <Text class="parity-header-text">HEADER — fades as you scroll ↓</Text>
      </AnimatedView>
      <!-- box-list160 is shared with the MVCP FlatList above. -->
      <AnimatedScrollView
        class="box-list160"
        :scroll-event-throttle="16"
        @scroll="onParityScroll"
      >
        <View v-for="i in scrollRows" :key="i" class="scroll-demo-row">
          <Text class="list-row-text">{{ `scroll me · row ${i}` }}</Text>
        </View>
      </AnimatedScrollView>
      <Text class="tiny-center"
        >↑ drag inside the box — the bar above reacts</Text
      >
      <!-- Native-driver proof for Animated.event: tap to JAM the JS thread 3s, then drag
           the box above DURING the freeze. If the bar keeps fading/lifting while JS is
           frozen, the scroll event drives parityScrollY on the UI thread (native attach).
           If it sticks until the thread frees, it was JS-driven. -->
      <ActionButton
        title="Freeze JS 3s — then scroll the box ↑"
        color="#fc8181"
        :onPress="freezeJs3s"
      />
      <Text class="tiny-center"
        >tap Freeze, then immediately drag the box — bar should still move</Text
      >

      <!-- Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect
           is unmistakable on the dark theme. -->
      <!-- boxShadow: a BLUE glow (a black shadow is invisible on the near-black bg).
           PASS: a soft blue halo bleeds out around the panel. -->
      <View class="shadow-card" :style="shadowCardExtra">
        <Text class="note-text">boxShadow · glow</Text>
      </View>
      <!-- filter: same base colour both sides; the right one is darkened by
           brightness(0.5). PASS: the right panel is clearly darker than the left. -->
      <View class="row">
        <View class="filter-tile">
          <Text class="tile-text">no filter</Text>
        </View>
        <View class="filter-tile" :style="dimStyle">
          <Text class="tile-text">brightness 0.5</Text>
        </View>
      </View>
      <!-- transformOrigin: the panel rotates around its TOP-LEFT corner, not its centre.
           PASS: the left edge stays put while the bottom-right swings down. -->
      <View class="rotated-card" :style="rotationStyle">
        <Text class="tile-text">transformOrigin · top-left</Text>
      </View>

      <!-- background-image: a CSS `linear-gradient(...)` authored entirely in App.css
           (.gradient-card), proving @symbiote-native/css-parser's `background-image` → RN's
           `experimental_backgroundImage` raw passthrough works end to end. PASS: the panel
           shows a blue-to-orange gradient sweeping left to right. -->
      <View class="gradient-card">
        <Text class="tile-text">background-image · linear-gradient</Text>
      </View>

      <!-- Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
           width/height→style); a screen reader reads "React logo" (alt→accessibilityLabel). -->
      <Image
        src="https://reactnative.dev/img/tiny_logo.png"
        alt="React logo"
        :width="48"
        :height="48"
        class="web-image"
      />

      <!-- KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field
           lifts it above the keyboard AND the keyboard is the email layout (proves
           autoComplete/inputMode fold); with enabled OFF the keyboard covers the field. -->
      <View class="switch-row">
        <Text class="switch-label">avoid keyboard</Text>
        <Switch
          v-model="kavEnabled"
          :track-color="{ false: '#334155', true: '#42b883' }"
        />
      </View>
      <KeyboardAvoidingView
        :behavior="Platform.OS === 'ios' ? 'padding' : 'height'"
        :enabled="kavEnabled"
      >
        <TextInput
          auto-complete="email"
          input-mode="email"
          enter-key-hint="done"
          placeholder="email — focus me near the bottom…"
          placeholder-text-color="#41506a"
          class="text-input"
        />
      </KeyboardAvoidingView>

      <Image
        :source="{ uri: 'https://reactnative.dev/img/tiny_logo.png' }"
        class="logo-image"
      />

      <View class="bottom-card">
        <Text class="bottom-text">↑ you scrolled to the bottom</Text>
      </View>

      <!-- Modal overlays its own window -->
      <Modal
        :visible="modalVisible"
        :transparent="true"
        animation-type="fade"
        @request-close="() => (modalVisible = false)"
      >
        <!-- transparent modal => paint our own dim layer (the RN pattern) -->
        <View class="modal-overlay">
          <View testID="modal-card" class="modal-card">
            <Text class="modal-title">It's a Modal</Text>
            <Text class="modal-body"
              >Rendered through ModalHostView — its own native window, same
              Fabric tree.</Text
            >
            <ActionButton
              testID="modal-close"
              title="Close"
              :onPress="() => (modalVisible = false)"
              :color="LINE_COLOR.primitives"
            />
          </View>
        </View>
      </Modal>

      <!-- Teleport: moves the toast card OUT of this scroll content and INTO the overlay-host
           View rendered as a sibling of ScrollView below — same surface, so it repaints on the
           ONE patch this tree already does. Our runtime-helpers shim validates `to` before
           delegating to the real Vue Teleport (vue-adapter-directives). -->
      <ActionButton
        testID="toast-open"
        title="Show toast (Teleport)"
        :onPress="() => (toastVisible = true)"
        :color="LINE_COLOR.primitives"
      />
      <Teleport v-if="overlayHost" :to="overlayHost">
        <View v-if="toastVisible" testID="toast-card" class="modal-card">
          <Text class="modal-body">Ported via Teleport ✦</Text>
          <ActionButton
            testID="toast-dismiss"
            title="Dismiss"
            :onPress="() => (toastVisible = false)"
            :color="LINE_COLOR.primitives"
          />
        </View>
      </Teleport>

      <!-- createTunnel: no ref, no target node — TunnelIn just registers its slot content from
           wherever it's mounted; TunnelOut (rendered in the overlay host below) reads it back
           through its OWN normal render, wherever that happens to be mounted, even a different
           surface. -->
      <ActionButton
        testID="tunnel-toast-open"
        title="Show toast (createTunnel)"
        :onPress="() => (tunnelToastVisible = true)"
        :color="LINE_COLOR.primitives"
      />
      <TunnelIn v-if="tunnelToastVisible">
        <View testID="tunnel-toast-card" class="modal-card">
          <Text class="modal-body">Ported via createTunnel ✦</Text>
          <ActionButton
            testID="tunnel-toast-dismiss"
            title="Dismiss"
            :onPress="() => (tunnelToastVisible = false)"
            :color="LINE_COLOR.primitives"
          />
        </View>
      </TunnelIn>
    </ScrollView>

    <!-- The Teleport/tunnel target: a persistent, empty View sitting above the scroll content.
         pointer-events="box-none" lets touches pass through everywhere except an actual ported
         child (the toast card). Rendered here — a sibling of ScrollView, same surface — so
         Teleport above can reach it via the template ref; createTunnel's TunnelOut below works
         identically wherever it's mounted. -->
    <View
      testID="overlay-host"
      ref="overlayHost"
      pointer-events="box-none"
      class="overlay-host"
    >
      <TunnelOut />
    </View>
  </SafeAreaView>
</template>
