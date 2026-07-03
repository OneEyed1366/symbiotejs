<!--
  The Vue canary, as a multi-file SFC. Metro compiles every .vue through metro-vue-transformer.js
  (parse → compileScript+inlineTemplate → 'vue'→@vue/runtime-core), so authoring is ordinary Vue —
  <template> + <script setup> — while every vnode still recommits through @symbiotejs/engine into
  Fabric, React Native's renderer never in the path (M3 / R4).

  This is the FULL "all primitives" canary, the SFC twin of examples/vue-tsx/App.tsx and
  examples/react/App.tsx (the ориентир): the root SafeAreaView → ScrollView composition lives here;
  the 8 demos (Animated, AnimatedParity, NativeModules, RefApi, PlatformColor, Accessibility,
  Responder, Parity) are each their own SFC under ./components, composed below in the same order as
  the TSX root. Same engine, same components, same palette; the ONLY visual difference vs the React
  and TSX canaries is the top badge line naming which renderer is in play.

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
  Button,
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
  type ISymbioteEvent,
  type IHostInstance,
} from '@symbiotejs/vue';
// A third-party native view via symbiote's own wrapper (not the library's React component); the
// engine derives RNCSlider's events + tint processors from its ViewConfig. Same wrapper as React.
import { Slider } from '@symbiotejs/slider/vue';

import AnimatedDemo from './components/AnimatedDemo.vue';
import AnimatedParityDemo from './components/AnimatedParityDemo.vue';
import NativeModulesDemo from './components/NativeModulesDemo.vue';
import RefApiDemo from './components/RefApiDemo.vue';
import PlatformColorDemo from './components/PlatformColorDemo.vue';
import AccessibilityDemo from './components/AccessibilityDemo.vue';
import ResponderDemo from './components/ResponderDemo.vue';
import ParityDemo from './components/ParityDemo.vue';
import { tunnelDemo } from './tunnel-demo';

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

// nativeEvent is a framework-agnostic Record<string, unknown>, so a numeric field
// (locationX/locationY…) arrives untyped, narrow it here instead of casting.
function nativeNumber(event: ISymbioteEvent, key: string): number {
  const value = event.nativeEvent[key];
  return typeof value === 'number' ? value : 0;
}

const count = ref(0);
const name = ref('');
const spinning = ref(true);
const volume = ref(0.5);
const modalVisible = ref(false);
// Teleport demo: shallowRef, not ref (vue-adapter-reactivity Gotcha 1) — a deep ref would wrap
// the engine node in a reactive Proxy the engine's WeakMap mirror misses.
const overlayHost = shallowRef<IHostInstance | null>(null);
const toastVisible = ref(false);
// createTunnel demo: no ref, no target node at all — <TunnelIn>/<TunnelOut> register/read a
// shared store, ordinary template markup, no h() (react-adapter-portal / vue-adapter-
// directives skills, "createTunnel — the cross-surface answer"). Aliased to PascalCase tags
// because Vue templates can't reference a dotted member (tunnelDemo.In) as a tag — same
// reason AnimatedView/AnimatedScrollView are aliased below.
const TunnelIn = tunnelDemo.In;
const TunnelOut = tunnelDemo.Out;
const tunnelToastVisible = ref(false);
const bannerVisible = ref(true);
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
    tintColor: '#42b883',
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
  StatusBar.setBackgroundColor(next ? '#ff0000' : '#22323f', true);
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

// Every static look lives in the <style scoped> block below (compiled at build time by
// @symbiotejs/css-parser into the same RN style objects StyleSheet.create used to produce —
// see the symbiote-sfc-style-compiler skill). What stays here is ONLY what a CSS class
// truly cannot express:
//   - a value computed at runtime (an Animated interpolation, item.color, a pressed/active
//     ternary, StyleSheet.hairlineWidth) — composed at the use site via :style, alongside
//     the element's own `class` for its static half (frontend-ux "style only for dynamics").
//   - `content-container-style` — a plain style-object prop (not `style`/`class`), so it
//     never reaches the class registry; kept as an ordinary object.
//   - `transform` / `transformOrigin` / `filter` / `box-shadow` DO have a CSS class form now
//     (raw CSS-text passthrough, 2026-07 — see .gradient-card below); shadowCardExtra/
//     dimStyle/rotationStyle below just predate that and still use a plain style object,
//     which is still valid, not a remaining gap.
const scrollContentStyle = {
  paddingVertical: 64,
  paddingHorizontal: 24,
  alignItems: 'stretch' as const,
  gap: 28,
};

// Pressable's `style` prop is a FUNCTION of press state (RN's own idiom) — Vue's `:class`
// binding only accepts a plain string/object/array, not a callback, so these two stay full
// JS objects rather than splitting a class out; the press-independent parts live inline too.
const pressableStyle = ({ pressed }: { pressed: boolean }) => ({
  paddingVertical: 16,
  borderRadius: 14,
  alignItems: 'center' as const,
  borderWidth: 1,
  backgroundColor: pressed ? '#2c3e50' : '#22323f',
  borderColor: pressed ? '#42b883' : '#369870',
});
const retentionStyle = ({ pressed }: { pressed: boolean }) => ({
  height: 64,
  borderRadius: 14,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: pressed ? '#369870' : '#2c3e50',
});

// boxShadow / filter / transform+transformOrigin kept as plain style objects here (both forms
// work — see .gradient-card in the <style> block below for the CSS-class equivalent).
const shadowCardExtra = {
  boxShadow: '0px 0px 22px 3px rgba(127,181,255,0.85)',
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
      :content-container-style="scrollContentStyle"
      :refresh-control="refreshControl"
    >
      <!-- JS->native: StatusBar renders nothing; it drives the iOS status bar imperatively. -->
      <StatusBar
        :bar-style="darkStatusBar ? 'dark-content' : 'light-content'"
        :hidden="statusBarHidden"
        :animated="true"
      />
      <!-- Hero card: logo + framework badge + title + body — same shape as the
           React/Angular/TSX canaries, so a glance at any of them confirms which
           adapter is driving the shared engine. -->
      <View testID="hero-card" class="hero-card">
        <Image
          testID="hero-logo"
          :source="{ uri: 'https://vuejs.org/images/logo.png' }"
          alt="Vue.js logo"
          resize-mode="contain"
          :width="56"
          :height="56"
          class="hero-logo"
        />
        <View class="hero-copy">
          <!-- The one allowed difference vs the React/TSX canary: a badge naming the renderer. -->
          <Text testID="hero-badge" class="badge"
            >▲ RENDERED FROM .VUE SFC</Text
          >
          <Text class="hero-title">symbiote · Vue SFC adapter</Text>
          <Text class="hero-body"
            >Vue SFC templates drive @symbiotejs/engine, then Fabric paints real
            native views.</Text
          >
        </View>
      </View>
      <Text class="title">symbiote · all primitives</Text>
      <!-- native->JS: keyboard height pushed from the device hub, read live -->
      <Text testID="keyboard-height-note" class="header-note">{{
        keyboardHeight > 0
          ? `keyboard up · ${keyboardHeight}px`
          : 'keyboard down'
      }}</Text>
      <!-- Tier A runtime modules, live. The border below IS the hairline. -->
      <Text
        testID="hairline-note"
        class="hairline-note"
        :style="{ borderTopWidth: StyleSheet.hairlineWidth }"
        >{{ hairlineText }}</Text
      >
      <!-- Tier B runtime modules, live. -->
      <Text testID="dimensions-note" class="header-note">{{
        dimensionsText
      }}</Text>

      <!-- JS->native StatusBar controls: watch the top strip react -->
      <View class="row">
        <View class="flex1">
          <Button
            testID="status-bar-toggle-btn"
            :title="statusBarHidden ? 'Show status bar' : 'Hide status bar'"
            @press="
              () => {
                statusBarHidden = !statusBarHidden;
              }
            "
            color="#42b883"
          />
        </View>
        <View class="flex1">
          <Button
            testID="status-bar-style-btn"
            :title="darkStatusBar ? 'Light text' : 'Dark text'"
            @press="
              () => {
                darkStatusBar = !darkStatusBar;
              }
            "
            color="#42b883"
          />
        </View>
      </View>
      <!-- #6 Android-only window flags: the blank-risk pair. PASS: the top strip turns
           red / goes translucent and the app STAYS rendered. -->
      <View v-if="Platform.OS === 'android'" class="row">
        <View class="flex1">
          <Button
            testID="status-bar-bg-btn"
            :title="statusBarRed ? 'BG default' : 'BG red'"
            @press="onToggleStatusBarRed"
            color="#42b883"
          />
        </View>
        <View class="flex1">
          <Button
            testID="status-bar-translucent-btn"
            :title="statusBarTranslucent ? 'Opaque' : 'Translucent'"
            @press="onToggleStatusBarTranslucent"
            color="#42b883"
          />
        </View>
      </View>
      <!-- JS->native imperative modules: tap to fire the real native UI / haptics. -->
      <View class="row">
        <View class="flex1">
          <Button
            testID="alert-btn"
            title="Alert"
            @press="onAlert"
            color="#42b883"
          />
        </View>
        <!-- ActionSheetIOS is iOS-only by design (no Android native module exists). -->
        <View v-if="Platform.OS !== 'android'" class="flex1">
          <Button
            testID="action-sheet-btn"
            title="Action sheet"
            @press="onActionSheet"
            color="#42b883"
          />
        </View>
      </View>
      <View class="row">
        <View class="flex1">
          <Button
            testID="share-btn"
            title="Share"
            @press="onShare"
            color="#42b883"
          />
        </View>
        <View class="flex1">
          <Button
            testID="vibrate-btn"
            title="Vibrate"
            @press="() => Vibration.vibrate()"
            color="#42b883"
          />
        </View>
      </View>
      <Button
        testID="open-url-btn"
        title="Open reactnative.dev"
        @press="onOpenUrl"
        color="#42b883"
      />

      <!-- The native UIRefreshControl spinner only shows while iOS holds the pull-down; our full
           re-commit snaps the offset back, so we drive our OWN indicator from `refreshing`. -->
      <View v-if="refreshing" class="refresh-row">
        <ActivityIndicator testID="refresh-indicator" color="#42b883" />
        <Text testID="refresh-status" class="accent-note">Refreshing…</Text>
      </View>
      <Text v-else testID="refresh-status" class="muted-center">{{
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
        placeholder-text-color="#3b5266"
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
          :track-color="{ false: '#334155', true: '#369870' }"
        />
      </View>
      <ActivityIndicator
        testID="spinner-indicator"
        :animating="spinning"
        color="#42b883"
        size="large"
      />

      <!-- Slider: the @react-native-community/slider native view via @symbiotejs/slider/vue. The
           engine derives its events + tint processors from the library's ViewConfig; same wrapper
           backs the React canary. -->
      <View class="section-tight">
        <Text class="switch-label">{{
          `volume · ${Math.round(volume * 100)}%`
        }}</Text>
        <Slider
          testID="volume-slider"
          v-model="volume"
          :minimum-value="0"
          :maximum-value="1"
          :step="0.01"
          minimum-track-tint-color="#42b883"
          maximum-track-tint-color="#334155"
          thumb-tint-color="#ffffff"
          class="slider"
        />
      </View>

      <!-- v-show: our runtime-helpers shim (vue-adapter-directives). Unlike the v-if/v-else
           above, the banner stays mounted and toggles native display:none, so its state
           survives a hide/show round-trip. -->
      <View class="switch-row">
        <Text class="switch-label">show banner (v-show)</Text>
        <Switch
          testID="vshow-toggle"
          v-model="bannerVisible"
          :track-color="{ false: '#334155', true: '#369870' }"
        />
      </View>
      <View v-show="bannerVisible" testID="vshow-banner" class="vshow-card">
        <Text class="tile-text">v-show · toggled without unmount</Text>
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

      <!-- Button opens a Modal -->
      <Button
        testID="modal-open"
        title="Open modal"
        @press="
          () => {
            modalVisible = true;
          }
        "
        color="#42b883"
      />

      <!-- Teleport: moves the toast card OUT of this scroll content and INTO the overlayHost View
           rendered as a sibling of ScrollView below (vue-adapter-directives skill) — same surface,
           so it repaints on the ONE commit this tree already does. Unlike Modal (its own native
           window), the toast stays a plain Fabric node, just relocated to sit above the scroll
           content. Our Teleport wrapper (compiler-injected, auto-retargeted by
           metro-vue-transformer.js) validates `to` before handing it to Vue's real Teleport. -->
      <Button
        testID="toast-open"
        title="Show toast (Teleport)"
        @press="
          () => {
            toastVisible = true;
          }
        "
        color="#42b883"
      />
      <Teleport v-if="toastVisible && overlayHost" :to="overlayHost">
        <View testID="toast-card" class="toast-card">
          <Text class="toast-text">Ported via Teleport ✦</Text>
          <Button
            testID="toast-dismiss-btn"
            title="Dismiss"
            @press="
              () => {
                toastVisible = false;
              }
            "
            color="#0f1e30"
          />
        </View>
      </Teleport>

      <!-- createTunnel: no ref, no target node — TunnelIn's default slot is ordinary template
           markup (react-adapter-portal / vue-adapter-directives skills); TunnelOut (rendered in
           the overlay host below) reads it back through its OWN normal render, wherever that
           happens to be mounted, even a different surface entirely. -->
      <Button
        testID="tunnel-toast-open"
        title="Show toast (createTunnel)"
        @press="
          () => {
            tunnelToastVisible = true;
          }
        "
        color="#42b883"
      />
      <TunnelIn v-if="tunnelToastVisible">
        <View testID="tunnel-toast-card" class="toast-card">
          <Text class="toast-text">Ported via createTunnel ✦</Text>
          <Button
            testID="tunnel-toast-dismiss-btn"
            title="Dismiss"
            @press="
              () => {
                tunnelToastVisible = false;
              }
            "
            color="#0f1e30"
          />
        </View>
      </TunnelIn>

      <!-- Pressable card with pressed-state feedback (children take press state via a scoped slot) -->
      <Pressable
        testID="pressable-card"
        @press="count += 1"
        :style="pressableStyle"
      >
        <template #default="{ pressed }">
          <Text
            class="pressable-label"
            :style="{ color: pressed ? '#42b883' : '#cbd5e1' }"
            >{{ pressed ? 'holding…' : 'press me (also +1)' }}</Text
          >
        </template>
      </Pressable>

      <!-- Horizontal FlatList: real windowing -->
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

      <!-- Press-retention measured rect. PASS: press, then drag DOWN ~100px: the panel STAYS
           highlighted (inside the measured rect + 80px bottom retention). -->
      <Pressable
        testID="retention-card"
        :hit-slop="{ top: 0, bottom: 40, left: 0, right: 0 }"
        :press-retention-offset="{ top: 0, bottom: 80, left: 0, right: 0 }"
        @press-move="onRetentionMove"
        :style="retentionStyle"
      >
        <Text testID="retention-readout" class="info-text">{{
          `drag me · dx ${retentionMove.dx} · dy ${retentionMove.dy}`
        }}</Text>
      </Pressable>

      <!-- maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows you are
           looking at DO NOT jump; new items appear above without shifting the viewport. -->
      <Text class="section-label">MVCP · prepend without jump</Text>
      <FlatList
        testID="mvcp-list"
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
      <Button
        testID="prepend-btn"
        title="Prepend 5"
        color="#42b883"
        @press="onPrepend"
      />

      <!-- Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the box
           below: the bright bar above SMOOTHLY fades to near-invisible and lifts, on the UI
           thread (no jank, no per-frame JS). -->
      <AnimatedView
        testID="parity-header"
        class="parity-header"
        :style="{
          opacity: parityHeaderOpacity,
          transform: [{ translateY: parityHeaderTranslateY }],
        }"
      >
        <Text class="parity-header-text">HEADER — fades as you scroll ↓</Text>
      </AnimatedView>
      <AnimatedScrollView
        testID="parity-scroll-box"
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
      <!-- Native-driver proof for Animated.event: tap to JAM the JS thread 3s, then drag the box. -->
      <Button
        testID="parity-freeze-js-btn"
        title="Freeze JS 3s — then scroll the box ↑"
        color="#fc8181"
        @press="freezeJs3s"
      />
      <Text class="tiny-center"
        >tap Freeze, then immediately drag the box — bar should still move</Text
      >

      <!-- Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect is clear. -->
      <!-- boxShadow: a BLUE glow (a black shadow is invisible on the near-black bg). -->
      <View class="shadow-card" :style="shadowCardExtra">
        <Text class="note-text">boxShadow · blue glow</Text>
      </View>
      <!-- filter: same base colour both sides; the right one is darkened by brightness(0.5). -->
      <View class="row">
        <View class="filter-tile">
          <Text class="tile-text">no filter</Text>
        </View>
        <View class="filter-tile" :style="dimStyle">
          <Text class="tile-text">brightness 0.5</Text>
        </View>
      </View>
      <!-- transformOrigin: the panel rotates around its TOP-LEFT corner, not its centre. -->
      <View class="rotated-card" :style="rotationStyle">
        <Text class="tile-text">transformOrigin · top-left</Text>
      </View>

      <!-- background-image: a CSS `linear-gradient(...)` authored entirely in the <style
           scoped> block below (.gradient-card), proving @symbiotejs/css-parser's
           `background-image` → RN's `experimental_backgroundImage` raw passthrough works
           end to end. PASS: the panel shows a blue-to-orange gradient sweeping left to right. -->
      <View class="gradient-card">
        <Text class="tile-text">background-image · linear-gradient</Text>
      </View>

      <!-- Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
           width/height→style); a screen reader reads "React logo" (alt→accessibilityLabel). -->
      <Image
        src="https://vuejs.org/images/logo.png"
        alt="React logo"
        :width="48"
        :height="48"
        class="web-image"
      />

      <!-- KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field lifts it
           above the keyboard AND the keyboard is the email layout. -->
      <View class="switch-row">
        <Text class="switch-label">avoid keyboard</Text>
        <Switch
          testID="kav-switch"
          v-model="kavEnabled"
          :track-color="{ false: '#334155', true: '#369870' }"
        />
      </View>
      <KeyboardAvoidingView
        :behavior="Platform.OS === 'ios' ? 'padding' : 'height'"
        :enabled="kavEnabled"
      >
        <TextInput
          testID="kav-email-input"
          auto-complete="email"
          input-mode="email"
          enter-key-hint="done"
          placeholder="email — focus me near the bottom…"
          placeholder-text-color="#3b5266"
          class="text-input"
        />
      </KeyboardAvoidingView>

      <Image
        :source="{ uri: 'https://vuejs.org/images/logo.png' }"
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
        @request-close="
          () => {
            modalVisible = false;
          }
        "
      >
        <!-- transparent modal => paint our own dim layer (the RN pattern) -->
        <View class="modal-overlay">
          <View testID="modal-card" class="modal-card">
            <Text class="modal-title">It's a Modal</Text>
            <Text class="modal-body"
              >Rendered through ModalHostView — its own native window, same
              Fabric tree.</Text
            >
            <Button
              testID="modal-close"
              title="Close"
              @press="
                () => {
                  modalVisible = false;
                }
              "
              color="#42b883"
            />
          </View>
        </View>
      </Modal>
    </ScrollView>

    <!-- The Teleport target: a persistent, empty View sitting above the scroll content.
         pointer-events="box-none" lets touches pass through everywhere except an actual
         teleported child (the toast card). Rendered here — a sibling of ScrollView, same
         surface — so the Teleport above can reach it. -->
    <View
      testID="overlay-host"
      ref="overlayHost"
      pointer-events="box-none"
      class="overlay-host"
    >
      <!-- createTunnel's content — no ref needed here at all: TunnelOut just renders
           whatever's currently registered, ordinary template markup. It would work
           identically if this View lived in a totally different mount()-ed surface than the
           "Show toast" button above. -->
      <TunnelOut />
    </View>
  </SafeAreaView>
</template>

<style scoped>
:global(.row) {
  flex-direction: row;
  gap: 12px;
}
:global(.flex1) {
  flex: 1;
}

.section-tight {
  gap: 8px;
}
.slider {
  height: 40px;
  align-self: stretch;
}
.section-label {
  color: #3b5266;
  font-size: 13px;
}
.info-text {
  color: #cbd5e1;
  font-size: 14px;
}
.note-text {
  color: #cbd5e1;
  font-size: 13px;
}
.switch-label {
  color: #cbd5e1;
  font-size: 16px;
}
.list-row-text {
  color: #cbd5e1;
  font-size: 15px;
}

/* the one allowed difference vs the React / TSX canary: the SFC badge */
.badge {
  color: #34d399;
  font-size: 14px;
  letter-spacing: 2px;
  text-align: center;
}

/* App */
.hero-card {
  align-items: center;
  background-color: #22323f;
  border-color: #369870;
  border-radius: 22px;
  border-width: 1px;
  flex-direction: row;
  gap: 16px;
  padding: 18px;
}
.hero-logo {
  height: 56px;
  width: 56px;
}
.hero-copy {
  flex: 1;
}
.hero-title {
  color: #ffffff;
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 10px;
}
.hero-body {
  color: #cbd5e1;
  font-size: 16px;
  line-height: 24px;
}
.title {
  color: #42b883;
  font-size: 16px;
  text-align: center;
}
.header-note {
  color: #42b883;
  font-size: 13px;
  text-align: center;
}
/* borderTopWidth stays dynamic (StyleSheet.hairlineWidth is a runtime constant) */
.hairline-note {
  color: #42b883;
  font-size: 13px;
  text-align: center;
  padding-top: 8px;
  border-top-color: #369870;
}
.refresh-row {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.accent-note {
  color: #42b883;
  font-size: 13px;
}
.muted-center {
  color: #3b5266;
  font-size: 13px;
  text-align: center;
}
.counter-card {
  padding-top: 18px;
  padding-bottom: 18px;
  border-radius: 16px;
  background-color: #369870;
  align-items: center;
}
.counter-text {
  color: #ffffff;
  font-size: 24px;
  font-weight: bold;
}
.text-input {
  height: 44px;
  border-radius: 10px;
  border-width: 1px;
  border-color: #369870;
  padding-left: 14px;
  padding-right: 14px;
  color: #ffffff;
  font-size: 18px;
  background-color: #22323f;
}
.greeting {
  color: #ffffff;
  font-size: 20px;
  text-align: center;
}
.switch-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-left: 4px;
  padding-right: 4px;
}
.pressable-label {
  font-size: 15px;
}
.chip-list {
  height: 84px;
}
/* width / marginRight stay dynamic — they reference the CHIP_WIDTH/CHIP_GAP script consts,
     which a CSS selector has no way to read */
.chip-card {
  height: 72px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
}
.chip-number {
  color: #1b2a36;
  font-size: 18px;
  font-weight: bold;
}
/* no hyphen before the digit run: kebabToCamel only rewrites "-[a-z]", so ".box-list-160"
     would parse to "boxList-160", not "boxList160" — a real trap the manual verification in
     the symbiote-sfc-style-compiler skill exists to catch */
.box-list160 {
  height: 160px;
  border-radius: 12px;
  background-color: #22323f;
}
.mvcp-row {
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 14px;
  padding-right: 14px;
}
/* opacity / transform stay dynamic (the native-driver scroll interpolation) */
.parity-header {
  background-color: #369870;
  border-radius: 12px;
  padding-top: 12px;
  padding-bottom: 12px;
  align-items: center;
}
.parity-header-text {
  color: #ffffff;
  font-size: 15px;
  font-weight: bold;
}
.scroll-demo-row {
  height: 80px;
  justify-content: center;
  padding-left: 14px;
  padding-right: 14px;
}
.tiny-center {
  color: #3b5266;
  font-size: 12px;
  text-align: center;
}
/* boxShadow, demoed here as a dynamic style object — the CSS form is equally supported now
   (raw passthrough, 2026-07), see .gradient-card below */
.shadow-card {
  height: 64px;
  border-radius: 12px;
  background-color: #2c3e50;
  align-items: center;
  justify-content: center;
}
.vshow-card {
  height: 64px;
  border-radius: 12px;
  background-color: #369870;
  align-items: center;
  justify-content: center;
}
.filter-tile {
  flex: 1;
  height: 64px;
  border-radius: 12px;
  background-color: #369870;
  align-items: center;
  justify-content: center;
}
.tile-text {
  color: #ffffff;
  font-size: 13px;
}
/* transformOrigin / transform, demoed above as a dynamic style object — same CSS-form
   note as boxShadow */
.rotated-card {
  height: 64px;
  border-radius: 12px;
  background-color: #369870;
  align-items: center;
  justify-content: center;
}
.gradient-card {
  height: 64px;
  border-radius: 12px;
  background-image: linear-gradient(to right, #2b6cb0, #f6ad55);
  align-items: center;
  justify-content: center;
}
.web-image {
  border-radius: 8px;
  align-self: center;
}
.logo-image {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  align-self: center;
}
.bottom-card {
  height: 200px;
  border-radius: 16px;
  background-color: #2c3e50;
  align-items: center;
  justify-content: center;
}
.bottom-text {
  color: #42b883;
  font-size: 16px;
}
.modal-overlay {
  flex: 1;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.6);
}
.modal-card {
  width: 280px;
  padding: 24px;
  border-radius: 20px;
  background-color: #22323f;
  align-items: center;
  gap: 16px;
}
.modal-title {
  color: #ffffff;
  font-size: 20px;
  font-weight: bold;
}
.modal-body {
  color: #cbd5e1;
  font-size: 14px;
  text-align: center;
}
.overlay-host {
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
}
.toast-card {
  position: absolute;
  bottom: 40px;
  align-self: center;
  padding: 16px;
  border-radius: 14px;
  background-color: #42b883;
  align-items: center;
  gap: 10px;
}
.toast-text {
  color: #0f1e30;
  font-size: 15px;
  font-weight: bold;
}

/* screen is used on both SafeAreaView and ScrollView, exactly as styles.screen was before */
.screen {
  flex: 1;
  background-color: #1b2a36;
}
</style>
