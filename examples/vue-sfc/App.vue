<!--
  The Vue canary, as a multi-file SFC. Metro compiles every .vue through metro-vue-transformer.js
  (parse → compileScript+inlineTemplate → 'vue'→@vue/runtime-core), so authoring is ordinary Vue —
  <template> + <script setup> — while every vnode still recommits through @symbiote/engine into
  Fabric, React Native's renderer never in the path (M3 / R4).

  This is the FULL "all primitives" canary, the SFC twin of examples/vue-tsx/App.tsx and
  examples/react/App.tsx (the ориентир): the root SafeAreaView → ScrollView composition lives here;
  the 8 demos (Animated, AnimatedParity, NativeModules, RefApi, PlatformColor, Accessibility,
  Responder, Parity) are each their own SFC under ./components, composed below in the same order as
  the TSX root. Same engine, same components, same palette; the ONLY visual difference vs the React
  and TSX canaries is the top badge line naming which renderer is in play.

  Non-template constructs handled the SFC way: RefreshControl is element-valued, so it is built in
  script via a computed h() and bound (:refresh-control); Animated.View / Animated.ScrollView are
  dotted, so they are aliased to <AnimatedView> / <AnimatedScrollView>; FlatList's renderItem is a
  prop function returning a VNode, so each is built with h() in script; Pressable's children take
  the press state through a scoped slot (#default="{ pressed }").
-->
<script setup lang="ts">
import { ref, computed, h, onMounted, onUnmounted } from 'vue'
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
} from '@symbiote/vue'

import AnimatedDemo from './components/AnimatedDemo.vue'
import AnimatedParityDemo from './components/AnimatedParityDemo.vue'
import NativeModulesDemo from './components/NativeModulesDemo.vue'
import RefApiDemo from './components/RefApiDemo.vue'
import PlatformColorDemo from './components/PlatformColorDemo.vue'
import AccessibilityDemo from './components/AccessibilityDemo.vue'
import ResponderDemo from './components/ResponderDemo.vue'
import ParityDemo from './components/ParityDemo.vue'

const AnimatedView = Animated.View
const AnimatedScrollView = Animated.ScrollView

const CHIP_WIDTH = 72
const CHIP_GAP = 12
const REFRESH_MS = 2000

const chips = Array.from({ length: 24 }, (_unused, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}))

// nativeEvent is a framework-agnostic Record<string, unknown>, so a numeric field
// (locationX/locationY…) arrives untyped, narrow it here instead of casting.
function nativeNumber(event: ISymbioteEvent, key: string): number {
  const value = event.nativeEvent[key]
  return typeof value === 'number' ? value : 0
}

const count = ref(0)
const name = ref('')
const spinning = ref(true)
const modalVisible = ref(false)
const refreshing = ref(false)
const refreshes = ref(0)
const keyboardHeight = ref(0)
const statusBarHidden = ref(false)
const darkStatusBar = ref(false)
// #6 Android-only StatusBar window flags: the blank-risk pair (device-verify-pending).
const statusBarRed = ref(false)
const statusBarTranslucent = ref(false)

// Feature-parity device checks: state for the cluster before the final logo.
const retentionMove = ref({ dx: 0, dy: 0 })
const mvcpItems = ref(
  Array.from({ length: 20 }, (_value, index) => ({ id: `row-${index}`, label: `item ${index}` })),
)
let mvcpHead = 0
// native-driver scroll value: Animated.event attaches it on the UI thread, so the
// header opacity/translateY are driven without a JS frame per scroll tick.
const parityScrollY = new Animated.Value(0)
const parityHeaderOpacity = parityScrollY.interpolate({
  inputRange: [0, 120],
  outputRange: [1, 0.12],
  extrapolate: 'clamp',
})
const parityHeaderTranslateY = parityScrollY.interpolate({
  inputRange: [0, 120],
  outputRange: [0, -16],
  extrapolate: 'clamp',
})
const onParityScroll = Animated.event(
  [{ nativeEvent: { contentOffset: { y: parityScrollY } } }],
  { useNativeDriver: true },
)
const kavEnabled = ref(true)

// 0..5, so the keyed v-for matches the TSX's index-keyed Array.from(length: 6).
const scrollRows = Array.from({ length: 6 }, (_value, index) => index)

// Tier B runtime modules, read live: the composables pull from Dimensions/Appearance,
// appState tracks foreground/background through AppState's device events.
const window = useWindowDimensions()
const colorScheme = useColorScheme()
const appState = ref<string>(AppState.currentState ?? 'unknown')

// native -> JS: the device hub pushes keyboard frames; we read the height live.
let keyboardSubs: Array<{ remove(): void }> = []
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
        : 0
    keyboardHeight.value = height
  }
  keyboardSubs = [
    Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
    Keyboard.addListener(KEYBOARD_EVENT.didHide, () => { keyboardHeight.value = 0 }),
  ]
})
onUnmounted(() => keyboardSubs.forEach(subscription => subscription.remove()))

// native -> JS: AppState pushes lifecycle changes; read the current phase live.
let appStateSub: { remove(): void } | undefined
onMounted(() => {
  appStateSub = AppState.addEventListener('change', (...args: unknown[]) => {
    const next = args[0]
    if (typeof next === 'string') appState.value = next
  })
})
onUnmounted(() => appStateSub?.remove())

const onRefresh = (): void => {
  refreshing.value = true
  setTimeout(() => {
    refreshing.value = false
    refreshes.value += 1
  }, REFRESH_MS)
}

// The RefreshControl as an element-valued prop — Vue templates can't inline an element into a
// prop, so build the VNode in script and bind it; recomputes when `refreshing` flips.
const refreshControl = computed(() =>
  h(RefreshControl, { refreshing: refreshing.value, onRefresh, tintColor: '#42b883' }),
)

// Tier A runtime modules, read live. A non-empty Version proves PlatformConstants resolved; a
// fractional hairline (e.g. 0.333 on @3x) proves DeviceInfo's scale resolved.
const hairlineText = computed(
  () =>
    `${Platform.OS} ${Platform.Version}` +
    `${Platform.isPad ? ' · iPad' : ''}` +
    ` · ${Platform.select({ ios: 'native ios', android: 'native android', default: '?' })}` +
    ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`,
)
// Real w×h@scale proves Dimensions + PixelRatio; a colorScheme proves Appearance; appState flips
// when you background the app (AppState's device events).
const dimensionsText = computed(
  () =>
    `${Math.round(window.value.width)}×${Math.round(window.value.height)} @${PixelRatio.get()}x` +
    ` · ${colorScheme.value ?? 'no-scheme'} · ${appState.value}`,
)

// JS->native StatusBar window flags (Android). setBackgroundColor/setTranslucent imperative drives.
const onToggleStatusBarRed = (): void => {
  const next = !statusBarRed.value
  statusBarRed.value = next
  StatusBar.setBackgroundColor(next ? '#ff0000' : '#22323f', true)
}
const onToggleStatusBarTranslucent = (): void => {
  const next = !statusBarTranslucent.value
  statusBarTranslucent.value = next
  StatusBar.setTranslucent(next)
}

// JS -> native imperative modules. A Promise reject (no native module / user
// cancel) is expected, so it's swallowed; this is a demo, not a flow to handle.
const onShare = (): void => {
  void Share.share({ message: 'Sent from symbiote', url: 'https://reactnative.dev' }).catch(
    () => {},
  )
}
const onAlert = (): void => {
  Alert.alert('symbiote', 'Native AlertManager reached.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Vibrate', onPress: () => Vibration.vibrate() },
  ])
}
const onActionSheet = (): void => {
  ActionSheetIOS.showActionSheetWithOptions(
    { options: ['Share', 'Vibrate', 'Cancel'], cancelButtonIndex: 2 },
    (index: number) => {
      if (index === 0) onShare()
      if (index === 1) Vibration.vibrate()
    },
  )
}
const onOpenUrl = (): void => {
  void Linking.openURL('https://reactnative.dev').catch(() => {})
}

// Pressable style is a function of the press state, exactly as React's style={({pressed}) => …}.
const pressableStyle = ({ pressed }: { pressed: boolean }) => [
  styles.pressableCard,
  {
    backgroundColor: pressed ? '#2c3e50' : '#22323f',
    borderColor: pressed ? '#42b883' : '#369870',
  },
]
const retentionStyle = ({ pressed }: { pressed: boolean }) => [
  styles.retentionCard,
  { backgroundColor: pressed ? '#369870' : '#2c3e50' },
]
const onRetentionMove = (event: ISymbioteEvent): void => {
  retentionMove.value = {
    dx: Math.round(nativeNumber(event, 'locationX')),
    dy: Math.round(nativeNumber(event, 'locationY')),
  }
}

// Horizontal FlatList: real windowing over 24 chips. renderItem is a prop function (no slot).
const chipsKeyExtractor = (item: { id: string; index: number; color: string }): string => item.id
const chipsGetItemLayout = (_data: unknown, index: number): { length: number; offset: number; index: number } =>
  ({ length: CHIP_WIDTH + CHIP_GAP, offset: (CHIP_WIDTH + CHIP_GAP) * index, index })
const chipRenderItem = ({ item }: { item: { id: string; index: number; color: string } }) =>
  h(View, { style: [styles.chipCard, { backgroundColor: item.color }] }, [
    h(Text, { style: styles.chipNumber }, String(item.index)),
  ])

// maintainVisibleContentPosition list: prepend without jump.
const mvcpKeyExtractor = (item: { id: string; label: string }): string => item.id
const mvcpRenderItem = ({ item }: { item: { id: string; label: string } }) =>
  h(View, { style: styles.mvcpRow }, [h(Text, { style: styles.listRowText }, item.label)])
const onPrepend = (): void => {
  mvcpHead -= 5
  const head = mvcpHead
  const prepended = Array.from({ length: 5 }, (_value, index) => {
    const n = head + index
    return { id: `row-${n}`, label: `item ${n}` }
  })
  mvcpItems.value = [...prepended, ...mvcpItems.value]
}

// Native-driver proof for Animated.event: JAM the JS thread 3s, then drag the box during the
// freeze. If the bar keeps fading/lifting while JS is frozen, the scroll drives parityScrollY on
// the UI thread (native attach); if it sticks until the thread frees, it was JS-driven.
const freezeJs3s = (): void => {
  const until = Date.now() + 3000
  while (Date.now() < until) {
    // Intentionally block the JS thread: no JS frame can run here, so any header motion during
    // the freeze must be coming from the native driver.
  }
}

// Static styles, grouped in one StyleSheet.create at the end of the script — same convention and
// palette as the TSX canary. Dynamic values (interpolations, pressed/active ternaries, item.color,
// StyleSheet.hairlineWidth) stay at the use site, composed via :style="[styles.x, { …dynamic }]".
const styles = StyleSheet.create({
  // shared / common
  screen: { flex: 1, backgroundColor: '#1b2a36' },
  scrollContent: { paddingVertical: 64, paddingHorizontal: 24, alignItems: 'stretch', gap: 28 },
  sectionTight: { gap: 8 },
  row: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },
  sectionLabel: { color: '#3b5266', fontSize: 13 },
  infoText: { color: '#cbd5e1', fontSize: 14 },
  noteText: { color: '#cbd5e1', fontSize: 13 },
  switchLabel: { color: '#cbd5e1', fontSize: 16 },
  listRowText: { color: '#cbd5e1', fontSize: 15 },

  // the one allowed difference vs the React / TSX canary: the SFC badge
  badge: { color: '#34d399', fontSize: 14, letterSpacing: 2, textAlign: 'center' },

  // App
  title: { color: '#42b883', fontSize: 16, textAlign: 'center' },
  headerNote: { color: '#42b883', fontSize: 13, textAlign: 'center' },
  hairlineNote: { color: '#42b883', fontSize: 13, textAlign: 'center', paddingTop: 8, borderTopColor: '#369870' },
  refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  accentNote: { color: '#42b883', fontSize: 13 },
  mutedCenter: { color: '#3b5266', fontSize: 13, textAlign: 'center' },
  counterCard: { paddingVertical: 18, borderRadius: 16, backgroundColor: '#369870', alignItems: 'center' },
  counterText: { color: '#ffffff', fontSize: 24, fontWeight: 'bold' },
  textInput: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#369870', paddingHorizontal: 14, color: '#ffffff', fontSize: 18, backgroundColor: '#22323f' },
  greeting: { color: '#ffffff', fontSize: 20, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  pressableCard: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  pressableLabel: { fontSize: 15 },
  chipList: { height: 84 },
  chipCard: { width: CHIP_WIDTH, height: 72, marginRight: CHIP_GAP, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chipNumber: { color: '#1b2a36', fontSize: 18, fontWeight: 'bold' },
  retentionCard: { height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  boxList160: { height: 160, borderRadius: 12, backgroundColor: '#22323f' },
  mvcpRow: { paddingVertical: 10, paddingHorizontal: 14 },
  parityHeader: { backgroundColor: '#369870', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  parityHeaderText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  scrollDemoRow: { height: 80, justifyContent: 'center', paddingHorizontal: 14 },
  tinyCenter: { color: '#3b5266', fontSize: 12, textAlign: 'center' },
  shadowCard: { height: 64, borderRadius: 12, backgroundColor: '#2c3e50', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 0px 22px 3px rgba(127,181,255,0.85)' },
  filterTile: { flex: 1, height: 64, borderRadius: 12, backgroundColor: '#369870', alignItems: 'center', justifyContent: 'center' },
  dim: { filter: [{ brightness: 0.5 }] },
  tileText: { color: '#ffffff', fontSize: 13 },
  rotatedCard: { height: 64, borderRadius: 12, backgroundColor: '#369870', alignItems: 'center', justifyContent: 'center', transformOrigin: 'top left', transform: [{ rotate: '4deg' }] },
  webImage: { borderRadius: 8, alignSelf: 'center' },
  logoImage: { width: 64, height: 64, borderRadius: 12, alignSelf: 'center' },
  bottomCard: { height: 200, borderRadius: 16, backgroundColor: '#2c3e50', alignItems: 'center', justifyContent: 'center' },
  bottomText: { color: '#42b883', fontSize: 16 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalCard: { width: 280, padding: 24, borderRadius: 20, backgroundColor: '#22323f', alignItems: 'center', gap: 16 },
  modalTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  modalBody: { color: '#cbd5e1', fontSize: 14, textAlign: 'center' },
})
</script>

<template>
  <SafeAreaView :style="styles.screen">
    <ScrollView
      testID="canary-scroll"
      :style="styles.screen"
      :content-container-style="styles.scrollContent"
      :refresh-control="refreshControl">
      <!-- JS->native: StatusBar renders nothing; it drives the iOS status bar imperatively. -->
      <StatusBar
        :bar-style="darkStatusBar ? 'dark-content' : 'light-content'"
        :hidden="statusBarHidden"
        :animated="true"
      />
      <!-- The one allowed difference vs the React/TSX canary: a badge naming the renderer. -->
      <Text :style="styles.badge">▲ RENDERED FROM .VUE SFC</Text>
      <Text :style="styles.title">symbiote · all primitives</Text>
      <!-- native->JS: keyboard height pushed from the device hub, read live -->
      <Text :style="styles.headerNote">{{ keyboardHeight > 0 ? `keyboard up · ${keyboardHeight}px` : 'keyboard down' }}</Text>
      <!-- Tier A runtime modules, live. The border below IS the hairline. -->
      <Text :style="[styles.hairlineNote, { borderTopWidth: StyleSheet.hairlineWidth }]">{{ hairlineText }}</Text>
      <!-- Tier B runtime modules, live. -->
      <Text :style="styles.headerNote">{{ dimensionsText }}</Text>

      <!-- JS->native StatusBar controls: watch the top strip react -->
      <View :style="styles.row">
        <View :style="styles.flex1">
          <Button
            :title="statusBarHidden ? 'Show status bar' : 'Hide status bar'"
            @press="() => { statusBarHidden = !statusBarHidden }"
            color="#42b883"
          />
        </View>
        <View :style="styles.flex1">
          <Button
            :title="darkStatusBar ? 'Light text' : 'Dark text'"
            @press="() => { darkStatusBar = !darkStatusBar }"
            color="#42b883"
          />
        </View>
      </View>
      <!-- #6 Android-only window flags: the blank-risk pair. PASS: the top strip turns
           red / goes translucent and the app STAYS rendered. -->
      <View v-if="Platform.OS === 'android'" :style="styles.row">
        <View :style="styles.flex1">
          <Button :title="statusBarRed ? 'BG default' : 'BG red'" @press="onToggleStatusBarRed" color="#42b883" />
        </View>
        <View :style="styles.flex1">
          <Button :title="statusBarTranslucent ? 'Opaque' : 'Translucent'" @press="onToggleStatusBarTranslucent" color="#42b883" />
        </View>
      </View>
      <!-- JS->native imperative modules: tap to fire the real native UI / haptics. -->
      <View :style="styles.row">
        <View :style="styles.flex1">
          <Button title="Alert" @press="onAlert" color="#42b883" />
        </View>
        <!-- ActionSheetIOS is iOS-only by design (no Android native module exists). -->
        <View v-if="Platform.OS !== 'android'" :style="styles.flex1">
          <Button title="Action sheet" @press="onActionSheet" color="#42b883" />
        </View>
      </View>
      <View :style="styles.row">
        <View :style="styles.flex1">
          <Button title="Share" @press="onShare" color="#42b883" />
        </View>
        <View :style="styles.flex1">
          <Button title="Vibrate" @press="() => Vibration.vibrate()" color="#42b883" />
        </View>
      </View>
      <Button title="Open reactnative.dev" @press="onOpenUrl" color="#42b883" />

      <!-- The native UIRefreshControl spinner only shows while iOS holds the pull-down; our full
           re-commit snaps the offset back, so we drive our OWN indicator from `refreshing`. -->
      <View v-if="refreshing" :style="styles.refreshRow">
        <ActivityIndicator color="#42b883" />
        <Text :style="styles.accentNote">Refreshing…</Text>
      </View>
      <Text v-else :style="styles.mutedCenter">{{ `pull to refresh · refreshed ${refreshes}×` }}</Text>

      <!-- View + press-to-increment -->
      <View testID="counter-card" @press="count += 1" :style="styles.counterCard">
        <Text testID="counter-value" :style="styles.counterText">{{ `tapped ${count}×` }}</Text>
      </View>

      <!-- TextInput + greeting -->
      <TextInput
        testID="greeting-input"
        :value="name"
        @change-text="(text) => { name = text }"
        placeholder="type your name…"
        placeholder-text-color="#3b5266"
        :style="styles.textInput"
      />
      <Text testID="greeting-output" :style="styles.greeting">{{ name ? `Hello, ${name}` : 'Hello, stranger' }}</Text>

      <!-- Switch drives the ActivityIndicator -->
      <View :style="styles.switchRow">
        <Text :style="styles.switchLabel">spinner</Text>
        <Switch testID="spinner-switch" :value="spinning" @value-change="(next) => { spinning = next }" :track-color="{ false: '#334155', true: '#369870' }" />
      </View>
      <ActivityIndicator testID="spinner-indicator" :animating="spinning" color="#42b883" size="large" />

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
      <Button testID="modal-open" title="Open modal" @press="() => { modalVisible = true }" color="#42b883" />

      <!-- Pressable card with pressed-state feedback (children take press state via a scoped slot) -->
      <Pressable @press="count += 1" :style="pressableStyle">
        <template #default="{ pressed }">
          <Text :style="[styles.pressableLabel, { color: pressed ? '#42b883' : '#cbd5e1' }]">{{ pressed ? 'holding…' : 'press me (also +1)' }}</Text>
        </template>
      </Pressable>

      <!-- Horizontal FlatList: real windowing -->
      <Text :style="styles.sectionLabel">FlatList · 24 chips, windowed</Text>
      <FlatList
        testID="chips-list"
        :data="chips"
        :horizontal="true"
        :key-extractor="chipsKeyExtractor"
        :get-item-layout="chipsGetItemLayout"
        :style="styles.chipList"
        :render-item="chipRenderItem"
      />

      <!-- ===== feature-parity device checks ===== -->

      <!-- Press-retention measured rect. PASS: press, then drag DOWN ~100px: the panel STAYS
           highlighted (inside the measured rect + 80px bottom retention). -->
      <Pressable
        :hit-slop="{ top: 0, bottom: 40, left: 0, right: 0 }"
        :press-retention-offset="{ top: 0, bottom: 80, left: 0, right: 0 }"
        @press-move="onRetentionMove"
        :style="retentionStyle">
        <Text :style="styles.infoText">{{ `drag me · dx ${retentionMove.dx} · dy ${retentionMove.dy}` }}</Text>
      </Pressable>

      <!-- maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows you are
           looking at DO NOT jump; new items appear above without shifting the viewport. -->
      <Text :style="styles.sectionLabel">MVCP · prepend without jump</Text>
      <FlatList
        :data="mvcpItems"
        :key-extractor="mvcpKeyExtractor"
        :maintain-visible-content-position="{ minIndexForVisible: 0 }"
        :style="styles.boxList160"
        :render-item="mvcpRenderItem"
      />
      <Button title="Prepend 5" color="#42b883" @press="onPrepend" />

      <!-- Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the box
           below: the bright bar above SMOOTHLY fades to near-invisible and lifts, on the UI
           thread (no jank, no per-frame JS). -->
      <AnimatedView :style="[styles.parityHeader, { opacity: parityHeaderOpacity, transform: [{ translateY: parityHeaderTranslateY }] }]">
        <Text :style="styles.parityHeaderText">HEADER — fades as you scroll ↓</Text>
      </AnimatedView>
      <AnimatedScrollView :style="styles.boxList160" :scroll-event-throttle="16" @scroll="onParityScroll">
        <View v-for="i in scrollRows" :key="i" :style="styles.scrollDemoRow">
          <Text :style="styles.listRowText">{{ `scroll me · row ${i}` }}</Text>
        </View>
      </AnimatedScrollView>
      <Text :style="styles.tinyCenter">↑ drag inside the box — the bar above reacts</Text>
      <!-- Native-driver proof for Animated.event: tap to JAM the JS thread 3s, then drag the box. -->
      <Button title="Freeze JS 3s — then scroll the box ↑" color="#fc8181" @press="freezeJs3s" />
      <Text :style="styles.tinyCenter">tap Freeze, then immediately drag the box — bar should still move</Text>

      <!-- Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect is clear. -->
      <!-- boxShadow: a BLUE glow (a black shadow is invisible on the near-black bg). -->
      <View :style="styles.shadowCard">
        <Text :style="styles.noteText">boxShadow · blue glow</Text>
      </View>
      <!-- filter: same base colour both sides; the right one is darkened by brightness(0.5). -->
      <View :style="styles.row">
        <View :style="styles.filterTile">
          <Text :style="styles.tileText">no filter</Text>
        </View>
        <View :style="[styles.filterTile, styles.dim]">
          <Text :style="styles.tileText">brightness 0.5</Text>
        </View>
      </View>
      <!-- transformOrigin: the panel rotates around its TOP-LEFT corner, not its centre. -->
      <View :style="styles.rotatedCard">
        <Text :style="styles.tileText">transformOrigin · top-left</Text>
      </View>

      <!-- Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
           width/height→style); a screen reader reads "React logo" (alt→accessibilityLabel). -->
      <Image
        src="https://vuejs.org/images/logo.png"
        alt="React logo"
        :width="48"
        :height="48"
        :style="styles.webImage"
      />

      <!-- KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field lifts it
           above the keyboard AND the keyboard is the email layout. -->
      <View :style="styles.switchRow">
        <Text :style="styles.switchLabel">avoid keyboard</Text>
        <Switch :value="kavEnabled" @value-change="(next) => { kavEnabled = next }" :track-color="{ false: '#334155', true: '#369870' }" />
      </View>
      <KeyboardAvoidingView :behavior="Platform.OS === 'ios' ? 'padding' : 'height'" :enabled="kavEnabled">
        <TextInput
          auto-complete="email"
          input-mode="email"
          enter-key-hint="done"
          placeholder="email — focus me near the bottom…"
          placeholder-text-color="#3b5266"
          :style="styles.textInput"
        />
      </KeyboardAvoidingView>

      <Image :source="{ uri: 'https://vuejs.org/images/logo.png' }" :style="styles.logoImage" />

      <View :style="styles.bottomCard">
        <Text :style="styles.bottomText">↑ you scrolled to the bottom</Text>
      </View>

      <!-- Modal overlays its own window -->
      <Modal
        :visible="modalVisible"
        :transparent="true"
        animation-type="fade"
        @request-close="() => { modalVisible = false }">
        <!-- transparent modal => paint our own dim layer (the RN pattern) -->
        <View :style="styles.modalOverlay">
          <View testID="modal-card" :style="styles.modalCard">
            <Text :style="styles.modalTitle">It's a Modal</Text>
            <Text :style="styles.modalBody">Rendered through ModalHostView — its own native window, same Fabric tree.</Text>
            <Button testID="modal-close" title="Close" @press="() => { modalVisible = false }" color="#42b883" />
          </View>
        </View>
      </Modal>
    </ScrollView>
  </SafeAreaView>
</template>
