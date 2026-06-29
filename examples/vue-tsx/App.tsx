// The Vue canary, authored in Vue JSX (.tsx) — the FULL port of examples/react/App.tsx (the
// ориентир), every primitive and demo it carries, on the same engine and palette. @vue/babel-
// plugin-jsx compiles the JSX in each setup()'s render fn to @vue/runtime-core createVNode calls
// (Metro aliases 'vue' → @vue/runtime-core), so every vnode recommits through @symbiote/engine into
// Fabric, with React Native's renderer never in the path (M3 / R4). Same engine, same components,
// same palette as the React and SFC canaries; only the authoring differs — the proof the whole
// component surface is template-agnostic.
//
// Every primitive here (View, Text, ScrollView, TextInput, Image, Switch, ActivityIndicator,
// Button, Pressable, Modal, FlatList, SectionList, RefreshControl, …) comes from @symbiote/vue,
// not react-native. The 8 sub-components and root composition mirror the React canary 1:1; the
// ONLY visual difference is the top badge line naming which one is rendering. Run with DEBUG=1 to
// watch each interaction commit incrementally (only the touched branch clones) in Metro's logs.

import { defineComponent, ref, shallowRef, onMounted, onUnmounted, type Ref } from 'vue'
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
  SectionList,
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
  AccessibilityInfo,
  PanResponder,
  I18nManager,
  Settings,
  PlatformColor,
  DynamicColorIOS,
  findNodeHandle,
  type IHostInstance,
  type ISymbioteEvent,
  type IFlatListHandle,
  type ISection,
} from '@symbiote/vue'

const CHIP_WIDTH = 72
const CHIP_GAP = 12
const REFRESH_MS = 2000

const chips = Array.from({ length: 24 }, (_, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}))

const SLIDE_DISTANCE = 220

// Animated, both drivers side by side. The pulse runs on the NATIVE driver: the
// curve lives in NativeAnimated, so zero JS runs per frame (DEBUG shows a single
// `native: startAnimatingNode`, no per-frame commits). The two slide dots run the
// SAME timing on different drivers: the JS one commits a clone every frame (DEBUG
// logs `commit … incremental` ~60×/run), the native one offloads it. Each dot keeps
// its own Animated.Value so a JS run and a native run never touch the same node.
const AnimatedDemo = defineComponent({
  name: 'AnimatedDemo',
  setup() {
    const pulse = new Animated.Value(0)
    const jsSlide = new Animated.Value(0)
    const nativeSlide = new Animated.Value(0)
    const jsForward = ref(false)
    const nativeForward = ref(false)

    // A perpetual native-driven heartbeat. A SINGLE looping timing offloads entirely
    // to native (iterations -1, zero JS per cycle); the 0->1 ramp becomes a breathe
    // in-and-out via the [0, 0.5, 1] interpolation, so no JS sequence is needed.
    const heartbeat = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
    )
    onMounted(() => heartbeat.start())
    onUnmounted(() => heartbeat.stop())

    const pulseScale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.3, 1] })
    const pulseOpacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] })

    const slide = (
      value: typeof jsSlide,
      forward: Ref<boolean>,
      useNativeDriver: boolean,
    ): void => {
      Animated.timing(value, {
        toValue: forward.value ? 0 : 1,
        duration: 600,
        useNativeDriver,
      }).start()
      forward.value = !forward.value
    }

    const jsX = jsSlide.interpolate({ inputRange: [0, 1], outputRange: [0, SLIDE_DISTANCE] })
    const nativeX = nativeSlide.interpolate({ inputRange: [0, 1], outputRange: [0, SLIDE_DISTANCE] })

    // Proof of offload (ADR 0017): kick both slides, then jam the JS thread for 1.5s.
    // The native-driven pulse + green slide keep moving on the UI side through the
    // freeze; the JS-driven orange slide stalls until the thread is released. If the
    // "native" path had silently fallen back to JS, the pulse would freeze too.
    const freezeJs = (): void => {
      slide(jsSlide, jsForward, false)
      slide(nativeSlide, nativeForward, true)
      const until = Date.now() + 1500
      while (Date.now() < until) {
        // Intentionally block the JS thread: no requestAnimationFrame can fire here.
      }
    }

    return () => (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Animated · JS vs native driver</Text>

        {/* native-driven perpetual pulse */}
        <View style={styles.pulseFrame}>
          <Animated.View
            testID="pulse-dot"
            style={[
              styles.pulseDot,
              { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
            ]}
          />
        </View>

        {/* JS-driven slide: a commit per frame */}
        <View style={styles.slideTrack}>
          <Animated.View
            testID="slide-js-dot"
            style={[styles.jsSlideDot, { transform: [{ translateX: jsX }] }]}
          />
        </View>
        <Button
          testID="slide-js-btn"
          title="Slide (JS driver)"
          onPress={() => slide(jsSlide, jsForward, false)}
          color="#f6ad55"
        />

        {/* native-driven slide: offloaded, zero JS frames */}
        <View style={styles.slideTrack}>
          <Animated.View
            testID="slide-native-dot"
            style={[styles.nativeSlideDot, { transform: [{ translateX: nativeX }] }]}
          />
        </View>
        <Button
          testID="slide-native-btn"
          title="Slide (native driver)"
          onPress={() => slide(nativeSlide, nativeForward, true)}
          color="#68d391"
        />

        {/* Freeze the JS thread 1.5s: native (pulse + green) keep moving, JS (orange) stalls */}
        <Button title="Freeze JS 1.5s" onPress={freezeJs} color="#fc8181" />
      </View>
    )
  },
})

// The rest of the Animated surface: ValueXY (2D), tracking (chase a moving target),
// and diffClamp (a collapsing header). Each is a thin port of the RN node.
const XY_SPAN = 96
const TRACK_DISTANCE = 200
const HEADER_COLLAPSE = 60

const AnimatedParityDemo = defineComponent({
  name: 'AnimatedParityDemo',
  setup() {
    // --- ValueXY + PanResponder: drag the box, clamped inside the frame --------
    // Track the resting position in a plain object; each move sets the absolute position
    // (resting + gesture delta) clamped to [0, DRAG_MAX] so the box can't leave the
    // frame. DRAG_MAX = inner width (XY_SPAN+36 - 6*2 padding) - box (36).
    const DRAG_MAX = XY_SPAN - 12
    const xy = new Animated.ValueXY({ x: 0, y: 0 })
    const restingPos = { x: 0, y: 0 }
    const clamp = (n: number): number => Math.max(0, Math.min(DRAG_MAX, n))
    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_event, gesture) => {
        xy.setValue({
          x: clamp(restingPos.x + gesture.dx),
          y: clamp(restingPos.y + gesture.dy),
        })
      },
      onPanResponderRelease: (_event, gesture) => {
        restingPos.x = clamp(restingPos.x + gesture.dx)
        restingPos.y = clamp(restingPos.y + gesture.dy)
      },
    })

    // --- Tracking: a follower spring-chases a lead value that animates on tap ---
    const lead = new Animated.Value(0)
    const follow = new Animated.Value(0)
    const leadForward = ref(false)
    onMounted(() => {
      // Set up once: follow tracks lead. Every lead change re-aims the spring, so the
      // follower lags and chases rather than jumping, the tracking signature.
      Animated.spring(follow, { toValue: lead, useNativeDriver: false }).start()
    })
    onUnmounted(() => follow.stopAnimation())
    const moveLead = (): void => {
      Animated.timing(lead, {
        toValue: leadForward.value ? 0 : TRACK_DISTANCE,
        duration: 700,
        useNativeDriver: false,
      }).start()
      leadForward.value = !leadForward.value
    }

    // --- diffClamp: a header that collapses as you scroll down, reveals on up ---
    const scroll = new Animated.Value(0)
    let scrollPos = 0
    const headerOffset = Animated.diffClamp(scroll, 0, HEADER_COLLAPSE).interpolate({
      inputRange: [0, HEADER_COLLAPSE],
      outputRange: [0, -HEADER_COLLAPSE],
    })
    const scrollBy = (delta: number): void => {
      scrollPos = Math.max(0, scrollPos + delta)
      Animated.timing(scroll, { toValue: scrollPos, duration: 180, useNativeDriver: false }).start()
    }

    return () => (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Animated · ValueXY / tracking / diffClamp</Text>

        {/* ValueXY box you drag with a finger (PanResponder) */}
        <Text style={styles.dragHint}>drag the purple box →</Text>
        <View style={styles.xyFrame}>
          <Animated.View
            {...panResponder.panHandlers}
            style={[styles.xyBox, { transform: xy.getTranslateTransform() }]}
          />
        </View>

        {/* Tracking: lead dot (blue) and follower (orange) that lags behind it */}
        <View style={styles.trackRow}>
          <Animated.View
            style={[styles.leadDot, { transform: [{ translateX: lead }] }]}
          />
        </View>
        <View style={styles.trackRow}>
          <Animated.View
            testID="follow-dot"
            style={[styles.followDot, { transform: [{ translateX: follow }] }]}
          />
        </View>
        <Button testID="track-btn" title="Move target (follower chases)" onPress={moveLead} color="#42b883" />

        {/* diffClamp collapsing header */}
        <View style={styles.collapseFrame}>
          <Animated.View
            style={[styles.collapseHeader, { transform: [{ translateY: headerOffset }] }]}
          >
            <Text style={styles.collapseHeaderText}>collapsing header</Text>
          </Animated.View>
        </View>
        <View style={styles.rowTight}>
          <View style={styles.flex1}>
            <Button title="Scroll ↓" onPress={() => scrollBy(40)} color="#38b2ac" />
          </View>
          <View style={styles.flex1}>
            <Button title="Scroll ↑" onPress={() => scrollBy(-40)} color="#38b2ac" />
          </View>
        </View>
      </View>
    )
  },
})

// Three runtime modules, each read live so it only resolves on a
// real host: I18nManager (RTL layout constants), Settings (a value round-tripped
// through iOS NSUserDefaults via SettingsManager), and Image's static methods
// (getSize / queryCache / prefetch, which hit the ImageLoader native module).
const LOGO_URI = 'https://vuejs.org/images/logo.png'
// A distinct cache key for the prefetch demo: same asset, different URL (query
// string), so nothing has loaded it yet. The cache starts cold and the button
// visibly warms it, unlike LOGO_URI, which getSize + the <Image> already pulled in.
const PREFETCH_URI = 'https://vuejs.org/images/logo.png?warm=symbiote'
const TAP_KEY = 'symbiote.tapCount'

const NativeModulesDemo = defineComponent({
  name: 'NativeModulesDemo',
  setup() {
    // I18nManager: RTL constants, read once at setup. A non-throwing read proves the
    // module name resolved; the values flip if you force RTL and relaunch.
    const rtl = I18nManager.getConstants()

    // Settings is a counter persisted to NSUserDefaults: read back on mount, bumped and
    // re-saved on tap, and watched so an external write to the key reflects live. It
    // survives a relaunch, which is the whole point of the module.
    const stored = Settings.get(TAP_KEY)
    const persisted = ref(typeof stored === 'number' ? stored : 0)
    let watchId: number | undefined
    onMounted(() => {
      watchId = Settings.watchKeys(TAP_KEY, () => {
        const next = Settings.get(TAP_KEY)
        if (typeof next === 'number') persisted.value = next
      })
    })
    onUnmounted(() => {
      if (watchId !== undefined) Settings.clearWatch(watchId)
    })
    const persistTap = (): void => {
      const next = persisted.value + 1
      Settings.set({ [TAP_KEY]: next })
      persisted.value = next
    }

    // Image statics: getSize resolves the rendered logo's real pixel dimensions
    // through ImageLoader (the <Image> below paints that same asset).
    const imageSize = ref('measuring…')
    onMounted(() => {
      Image.getSize(LOGO_URI)
        .then(({ width, height }) => { imageSize.value = `${width}×${height}px` })
        .catch(() => { imageSize.value = 'unavailable' })
    })

    // Prefetch on a COLD url nothing has loaded: queryCache shows it absent, the
    // button warms it, and a re-query flips the readout, the visible effect.
    const cacheState = ref('checking…')
    const refreshCache = (): void => {
      Image.queryCache([PREFETCH_URI])
        .then(cache => { cacheState.value = cache[PREFETCH_URI] ?? 'not cached' })
        .catch(() => { cacheState.value = 'unavailable' })
    }
    onMounted(() => refreshCache())
    const prefetchLogo = (): void => {
      cacheState.value = 'prefetching…'
      void Image.prefetch(PREFETCH_URI)
        .then(() => refreshCache())
        .catch(() => { cacheState.value = 'unavailable' })
    }

    return () => (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          Runtime modules · I18nManager / Settings / Image statics
        </Text>

        {/* I18nManager: RTL layout constants, read live */}
        <Text style={styles.infoText}>
          {`RTL: ${rtl.isRTL ? 'on' : 'off'} · swap L/R: ${rtl.doLeftAndRightSwapInRTL ? 'yes' : 'no'}`}
        </Text>
        <Button
          title={rtl.isRTL ? 'Force LTR (needs reload)' : 'Force RTL (needs reload)'}
          onPress={() => I18nManager.forceRTL(!rtl.isRTL)}
          color="#42b883"
        />

        {/* Settings: counter persisted to NSUserDefaults, survives a relaunch */}
        <Text testID="persist-count" style={styles.infoText}>
          {`persisted taps: ${persisted.value} · survives relaunch`}
        </Text>
        <Button testID="persist-btn" title="Persist a tap" onPress={persistTap} color="#42b883" />

        {/* Image statics: the rendered asset + getSize's measurement of it */}
        <View style={styles.rowAlignCenter}>
          <Image
            source={{ uri: LOGO_URI }}
            style={styles.logoThumb}
          />
          <Text testID="logo-size" style={styles.infoTextFlex}>
            {`logo size: ${imageSize.value}`}
          </Text>
        </View>
        {/* prefetch warms a cold url: not cached → (tap) → cached */}
        <Text style={styles.infoText}>{`prefetch cache: ${cacheState.value}`}</Text>
        <Button title="Prefetch logo" onPress={prefetchLogo} color="#42b883" />
      </View>
    )
  },
})

// Imperative host-ref API: the seam reanimated / gesture-handler reach through.
// `measure` returns the box's real on-screen frame (only a live host can answer it);
// `setNativeProps` recolors the box bypassing Vue entirely (no reactive state, no re-render);
// `findNodeHandle` reads the committed native tag. The flash holds until the next Vue commit
// re-applies the declarative style, exactly RN's imperative-override semantics.
const RefApiDemo = defineComponent({
  name: 'RefApiDemo',
  setup() {
    // shallowRef, NOT ref: the engine node is held by IDENTITY so measure()/setNativeProps()
    // hit the engine's WeakMap mirror (a plain ref wraps it in a reactive Proxy → mirror miss).
    const boxRef = shallowRef<IHostInstance | null>(null)
    let flashed = false
    const frame = ref('tap “Measure”')
    const tag = ref<number | null>(null)

    onMounted(() => {
      // The tag exists only after the first commit, so read it post-mount.
      tag.value = findNodeHandle(boxRef.value)
    })

    const onMeasure = (): void => {
      const box = boxRef.value
      if (box === null) return
      box.measure((x, y, width, height, pageX, pageY) => {
        frame.value =
          `x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
          ` · page ${Math.round(pageX)},${Math.round(pageY)}`
      })
    }

    const onFlash = (): void => {
      const box = boxRef.value
      if (box === null) return
      flashed = !flashed
      box.setNativeProps({ style: { backgroundColor: flashed ? '#f6ad55' : '#42b883' } })
    }

    return () => (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          Imperative ref · measure / setNativeProps / findNodeHandle
        </Text>
        <View
          ref={boxRef}
          testID="ref-box"
          style={styles.refBox}>
          <Text style={styles.refBoxText}>
            {`native tag ${tag.value ?? '—'}`}
          </Text>
        </View>
        <Text testID="measure-frame" style={styles.infoText}>{`frame: ${frame.value}`}</Text>
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Button testID="measure-btn" title="Measure" onPress={onMeasure} color="#42b883" />
          </View>
          <View style={styles.flex1}>
            <Button title="Flash (setNativeProps)" onPress={onFlash} color="#f6ad55" />
          </View>
        </View>
      </View>
    )
  },
})

// PlatformColor / DynamicColorIOS resolve on the native side: 'systemBlue' / 'label'
// become iOS UIColor selectors, and the dynamic tuple flips with the system
// appearance. The opaque color objects flow through the same color seam as CSS
// strings (processColor), so no special handling reaches Fabric. Name resolution is
// device-only: a wrong name silently falls back, so this is verified on simulator.
const PlatformColorDemo = defineComponent({
  name: 'PlatformColorDemo',
  setup() {
    const scheme = useColorScheme()
    return () => (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          {`PlatformColor · semantic + DynamicColorIOS (${scheme.value ?? 'unknown'})`}
        </Text>
        <View style={styles.row}>
          <View
            style={[styles.colorTile, { backgroundColor: PlatformColor('systemBlue') }]}>
            <Text style={styles.tileLabel}>systemBlue</Text>
          </View>
          <View
            style={[
              styles.colorTileBordered,
              {
                backgroundColor: DynamicColorIOS({ light: '#dcf3e8', dark: '#2c3e50' }),
                borderColor: PlatformColor('separator'),
              },
            ]}>
            <Text style={[styles.boldLabel, { color: PlatformColor('label') }]}>
              dynamic
            </Text>
          </View>
        </View>
      </View>
    )
  },
})

// Responder: the gesture capabilities exposed here, shown so the grabbed
// element is the one that moves. Each chip is its OWN responder: it grabs on touch
// start and drags ITSELF (onResponderMove translates that chip). Drag a chip past a
// threshold and the surrounding strip STEALS the gesture: its onMoveShouldSetResponder
// fires once the finger has travelled far enough, the chip yields (onResponder-
// TerminationRequest -> terminate, so it snaps back) and the strip pans the whole row.
// A small drag moves the digit; a big drag hands off to the strip: move-should-set and
// transfer, each visible (and the separate "transfer" line lights on the hand-off).
// DEBUG logcat shows "responder transferred ... -> ..." at that moment.
const RESPONDER_CHIPS = [0, 1, 2, 3, 4]
// Horizontal travel (in the touch's page units: px on Android, pt on iOS, so the feel
// differs a little per platform) after which the strip steals the gesture from the chip.
const RESPONDER_STEAL_DX = 64

function firstTouchX(event: ISymbioteEvent): number {
  const touches = event.nativeEvent.touches
  if (!Array.isArray(touches) || touches.length === 0) return 0
  const first: unknown = touches[0]
  if (typeof first === 'object' && first !== null && 'pageX' in first) {
    const pageX = first.pageX
    return typeof pageX === 'number' ? pageX : 0
  }
  return 0
}

// nativeEvent is a framework-agnostic Record<string, unknown>, so a numeric field
// (locationX/locationY…) arrives untyped, narrow it here instead of casting.
function nativeNumber(event: ISymbioteEvent, key: string): number {
  const value = event.nativeEvent[key]
  return typeof value === 'number' ? value : 0
}

const ResponderDemo = defineComponent({
  name: 'ResponderDemo',
  setup() {
    const activeChip = ref<number | null>(null)
    const chipDx = ref(0)
    const rowDx = ref(0)
    const status = ref('tap a chip · drag it to move · drag far → strip steals it')
    const transfer = ref('')
    let startX = 0
    let panStartX = 0
    let grabbed: number | null = null

    return () => (
      <View style={styles.sectionTight}>
        <Text style={styles.sectionLabel}>
          Responder · drag a chip vs hand-off to the strip
        </Text>
        <Text style={styles.infoText}>{status.value}</Text>
        {/* the separate transfer indicator, lit only when the strip steals the gesture */}
        <Text style={[styles.transferText, { color: transfer.value ? '#f6ad55' : '#3b5266' }]}>
          {transfer.value || 'transfer: —'}
        </Text>
        <View
          // Claims the gesture only once the finger has travelled past the threshold,
          // stealing it from whichever chip currently holds it, the transfer path.
          onMoveShouldSetResponder={(event: ISymbioteEvent) =>
            grabbed !== null &&
            Math.abs(firstTouchX(event) - startX) > RESPONDER_STEAL_DX
          }
          onResponderGrant={(event: ISymbioteEvent) => {
            transfer.value = `↯ strip stole the gesture from chip ${grabbed ?? '?'}`
            activeChip.value = null
            chipDx.value = 0
            panStartX = firstTouchX(event)
            status.value = 'strip panning'
          }}
          onResponderMove={(event: ISymbioteEvent) => { rowDx.value = firstTouchX(event) - panStartX }}
          onResponderRelease={() => { rowDx.value = 0; status.value = 'strip released' }}
          onResponderTerminate={() => { rowDx.value = 0 }}
          style={styles.stripBox}>
          <View style={[styles.rowTight, { transform: [{ translateX: rowDx.value }] }]}>
            {RESPONDER_CHIPS.map((index) => (
              <View
                key={index}
                testID={`resp-chip-${index}`}
                // Grabs on start and drags itself; yields to the strip past the threshold.
                onStartShouldSetResponder={() => true}
                onResponderGrant={(event: ISymbioteEvent) => {
                  startX = firstTouchX(event)
                  grabbed = index
                  activeChip.value = index
                  chipDx.value = 0
                  rowDx.value = 0
                  transfer.value = ''
                  status.value = `chip ${index} grabbed`
                }}
                onResponderMove={(event: ISymbioteEvent) => {
                  const dx = firstTouchX(event) - startX
                  chipDx.value = dx
                  status.value = `chip ${index} moving · dx=${Math.round(dx)}`
                }}
                onResponderTerminationRequest={() => true}
                onResponderTerminate={() => { chipDx.value = 0; activeChip.value = null }}
                onResponderRelease={() => { chipDx.value = 0; activeChip.value = null; status.value = `chip ${index} released` }}
                style={[
                  styles.chip,
                  {
                    borderColor: activeChip.value === index ? '#42b883' : 'transparent',
                    transform: [{ translateX: activeChip.value === index ? chipDx.value : 0 }],
                  },
                ]}>
                <Text style={styles.chipText}>{index}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    )
  },
})

// Accessibility: the props reach native unchanged (accessibilityLabel -> Android
// content-desc / iOS accessibilityLabel; accessibilityState -> checked/selected/enabled),
// the web aria-*/role aliases FOLD to accessibility* in our wrapper (raw aria-* must
// never reach native), and AccessibilityInfo reads device state + drives announce.
// Verify on Android with `uiautomator dump` (content-desc / selected / enabled) and
// logcat for the announce + module-resolution dlogs; on iOS via Accessibility Inspector.
const AccessibilityDemo = defineComponent({
  name: 'AccessibilityDemo',
  setup() {
    const screenReader = ref('querying…')

    onMounted(() => {
      // A non-throwing getter proves the native module name resolved (Android
      // 'AccessibilityInfo' / iOS 'AccessibilityManager'); a reject means wrong name.
      AccessibilityInfo.isScreenReaderEnabled()
        .then(enabled => { screenReader.value = enabled ? 'on' : 'off' })
        .catch(() => { screenReader.value = 'unavailable' })
      AccessibilityInfo.announceForAccessibility('symbiote accessibility online')
    })

    return () => (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          Accessibility · props → native · aria/role transform · AccessibilityInfo
        </Text>
        {/* getter readout: 'off' (no screen reader) proves the module resolved */}
        <Text style={styles.infoText}>{`screen reader: ${screenReader.value}`}</Text>
        {/* canonical accessibility*: content-desc 'a11y-canonical-label' + role=header */}
        <View
          accessible={true}
          accessibilityRole="header"
          accessibilityLabel="a11y-canonical-label"
          style={styles.a11yCard}>
          <Text style={styles.infoText}>canonical label + role=header</Text>
        </View>
        {/* web aria and role aliases MUST fold: content-desc should be
            'a11y-aria-label', a raw aria-label attribute must not reach the native node */}
        <View
          accessible={true}
          role="button"
          aria-label="a11y-aria-label"
          style={styles.a11yCard}>
          <Text style={styles.infoText}>aria-label + role=button</Text>
        </View>
        {/* accessibilityState: uiautomator shows enabled=false / selected=true */}
        <View
          accessible={true}
          accessibilityLabel="a11y-state"
          accessibilityState={{ disabled: true, selected: true }}
          style={styles.a11yCard}>
          <Text style={styles.infoText}>state: disabled + selected</Text>
        </View>
      </View>
    )
  },
})

// Verification panel for five feature-parity behaviors with
// no prior canary surface: Text.onLongPress synthesis, Keyboard.dismiss (blur the
// focused input), animated VirtualizedList scroll, sticky SectionList headers, and
// Android setAccessibilityFocus. Each leaves a dlog seam (DEBUG=1 -> logcat) and a
// visible effect, so a real host confirms what the headless smokes prove in JS.
const PARITY_ROW_H = 30
const parityRows = Array.from({ length: 30 }, (_unused, index) => ({ id: `pr-${index}`, n: index }))
// Tall sections (taller than the list viewport) so the sticky cross-talk is visible: as
// you scroll, the next section header should reach the top and PUSH the pinned one off.
const sectionData = (prefix: string, label: string): { id: string; label: string }[] =>
  Array.from({ length: 8 }, (_unused, index) => ({ id: `${prefix}${index}`, label: `${label} ${index}` }))
const paritySections: ISection<{ id: string; label: string }>[] = [
  { title: 'Fruit', data: sectionData('f', 'apple') },
  { title: 'Tools', data: sectionData('t', 'hammer') },
  { title: 'Cities', data: sectionData('c', 'porto') },
]

const ParityDemo = defineComponent({
  name: 'ParityDemo',
  setup() {
    const listRef = shallowRef<IFlatListHandle | null>(null)
    const titleRef = shallowRef<IHostInstance | null>(null)
    const longPressMsg = ref('long-press or tap the row below')
    const dismissMsg = ref('focus the field, then Hide keyboard')

    return () => (
      <View style={styles.section}>
        <Text ref={titleRef} style={styles.sectionLabel}>
          Parity checks · longPress · dismiss · animated scroll · sticky · a11y focus
        </Text>

        {/* #10 Text.onLongPress synthesis: hold ~0.5s (suppresses tap) vs quick tap */}
        <Text
          onLongPress={() => { longPressMsg.value = 'long press! (tap was suppressed)' }}
          onPress={() => { longPressMsg.value = 'tap' }}
          style={styles.longPressRow}>
          {longPressMsg.value}
        </Text>

        {/* #15 Keyboard.dismiss: blurs whatever input holds focus without needing a ref */}
        <TextInput
          placeholder="focus me…"
          placeholderTextColor="#3b5266"
          onFocus={() => { dismissMsg.value = 'keyboard up — tap Hide keyboard' }}
          onBlur={() => { dismissMsg.value = 'blurred (keyboard down)' }}
          style={styles.focusInput}
        />
        <Text style={styles.noteText}>{dismissMsg.value}</Text>
        <Button title="Hide keyboard" onPress={() => Keyboard.dismiss()} color="#42b883" />

        {/* #12 animated VirtualizedList scroll: smooth (native command) vs instant.
            A fixed height with no wrapper: the vertical ScrollView clips to its own
            frame (overflow:'scroll' base, like RN), so rows stay inside the box on iOS too. */}
        <Text style={styles.sectionLabel}>FlatList · animated scrollToOffset</Text>
        <FlatList
          ref={listRef}
          data={parityRows}
          keyExtractor={(item: { id: string; n: number }) => item.id}
          getItemLayout={(_data: unknown, index: number) => ({ length: PARITY_ROW_H, offset: PARITY_ROW_H * index, index })}
          style={styles.parityList}
          renderItem={({ item }: { item: { id: string; n: number } }) => (
            <View style={styles.parityRow}>
              <Text style={styles.infoText}>{`row ${item.n}`}</Text>
            </View>
          )}
        />
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Button title="Scroll ▼ animated" onPress={() => listRef.value?.scrollToOffset({ offset: 20 * PARITY_ROW_H, animated: true })} color="#42b883" />
          </View>
          <View style={styles.flex1}>
            <Button title="Top · instant" onPress={() => listRef.value?.scrollToOffset({ offset: 0, animated: false })} color="#42b883" />
          </View>
        </View>

        {/* #13 sticky section headers. Drag the inner list: each header pins at the top.
            Cross-talk check: as the NEXT header reaches the top it should PUSH the pinned
            one off (nextHeaderLayoutY not yet wired, watch push vs overlap). */}
        <Text style={styles.sectionLabel}>SectionList · sticky (scroll: next header should push prev off)</Text>
        <SectionList
          testID="sticky-section-list"
          sections={paritySections}
          keyExtractor={(item: { id: string; label: string }) => item.id}
          stickySectionHeadersEnabled={true}
          style={styles.sectionList}
          renderSectionHeader={({ section }: { section: { title: string } }) => (
            <Text style={styles.sectionHeader}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }: { item: { id: string; label: string } }) => (
            <View style={styles.parityRow}>
              <Text style={styles.infoText}>{item.label}</Text>
            </View>
          )}
        />

        {/* #14 a11y focus: node-based sendAccessibilityEvent routes through the Fabric
            slot on both platforms (enable TalkBack/VoiceOver to feel the focus jump) */}
        <Button
          title="Focus the panel title (a11y)"
          onPress={() => {
            if (titleRef.value !== null) {
              AccessibilityInfo.sendAccessibilityEvent(titleRef.value, 'focus')
            }
          }}
          color="#42b883"
        />
      </View>
    )
  },
})

const App = defineComponent({
  name: 'App',
  setup() {
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

    return () => (
      <SafeAreaView style={styles.screen}>
      <ScrollView
        testID="canary-scroll"
        style={styles.screen}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing.value} onRefresh={onRefresh} tintColor="#42b883" />
        }>
        {/* JS->native: StatusBar renders nothing; it drives the iOS status bar
            (the top strip: clock, wi-fi, battery) imperatively from these props. */}
        <StatusBar
          barStyle={darkStatusBar.value ? 'dark-content' : 'light-content'}
          hidden={statusBarHidden.value}
          animated={true}
        />
        {/* The one allowed difference vs the React canary: a badge naming the renderer. */}
        <Text style={styles.badge}>◆ RENDERED FROM .TSX (Vue JSX)</Text>
        <Text style={styles.title}>
          symbiote · all primitives
        </Text>
        {/* native->JS: keyboard height pushed from the device hub, read live */}
        <Text style={styles.headerNote}>
          {keyboardHeight.value > 0 ? `keyboard up · ${keyboardHeight.value}px` : 'keyboard down'}
        </Text>
        {/* Tier A runtime modules, read live from the real native side. A non-empty
            Version proves PlatformConstants resolved; a fractional hairline (e.g. 0.333
            on @3x) proves DeviceInfo's scale resolved. The border below IS that hairline. */}
        <Text style={[styles.hairlineNote, { borderTopWidth: StyleSheet.hairlineWidth }]}>
          {`${Platform.OS} ${Platform.Version}` +
            `${Platform.isPad ? ' · iPad' : ''}` +
            ` · ${Platform.select({ ios: 'native ios', android: 'native android', default: '?' })}` +
            ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`}
        </Text>
        {/* Tier B runtime modules, live. Real w×h@scale proves Dimensions + PixelRatio;
            a colorScheme proves Appearance; appState flips when you background the app
            (AppState's device events). */}
        <Text style={styles.headerNote}>
          {`${Math.round(window.value.width)}×${Math.round(window.value.height)} @${PixelRatio.get()}x` +
            ` · ${colorScheme.value ?? 'no-scheme'} · ${appState.value}`}
        </Text>
        {/* JS->native StatusBar controls: watch the top strip react */}
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Button
              title={statusBarHidden.value ? 'Show status bar' : 'Hide status bar'}
              onPress={() => { statusBarHidden.value = !statusBarHidden.value }}
              color="#42b883"
            />
          </View>
          <View style={styles.flex1}>
            <Button
              title={darkStatusBar.value ? 'Light text' : 'Dark text'}
              onPress={() => { darkStatusBar.value = !darkStatusBar.value }}
              color="#42b883"
            />
          </View>
        </View>
        {/* #6 Android-only window flags: the blank-risk pair. PASS: the top strip turns
            red / goes translucent and the app STAYS rendered. FAIL: the surface blanks
            (white screen); watch logcat for stopSurface / "reactInstance is null". */}
        {Platform.OS === 'android' && (
          <View style={styles.row}>
            <View style={styles.flex1}>
              <Button
                title={statusBarRed.value ? 'BG default' : 'BG red'}
                onPress={() => {
                  const next = !statusBarRed.value
                  statusBarRed.value = next
                  StatusBar.setBackgroundColor(next ? '#ff0000' : '#22323f', true)
                }}
                color="#42b883"
              />
            </View>
            <View style={styles.flex1}>
              <Button
                title={statusBarTranslucent.value ? 'Opaque' : 'Translucent'}
                onPress={() => {
                  const next = !statusBarTranslucent.value
                  statusBarTranslucent.value = next
                  StatusBar.setTranslucent(next)
                }}
                color="#42b883"
              />
            </View>
          </View>
        )}
        {/* JS->native imperative modules: tap to fire the real native UI / haptics.
            Each working button proves its module name resolved on the bridgeless host. */}
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Button title="Alert" onPress={onAlert} color="#42b883" />
          </View>
          {/* ActionSheetIOS drives the iOS-only ActionSheetManager; no Android native
              module exists, so the control is iOS-only by design (not a gap). */}
          {Platform.OS !== 'android' && (
            <View style={styles.flex1}>
              <Button title="Action sheet" onPress={onActionSheet} color="#42b883" />
            </View>
          )}
        </View>
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Button title="Share" onPress={onShare} color="#42b883" />
          </View>
          <View style={styles.flex1}>
            <Button title="Vibrate" onPress={() => Vibration.vibrate()} color="#42b883" />
          </View>
        </View>
        <Button title="Open reactnative.dev" onPress={onOpenUrl} color="#42b883" />

        {/* The native UIRefreshControl spinner only shows while iOS holds the scroll
            view pulled-down; our full re-commit snaps the offset back, so we drive
            our OWN indicator from the same `refreshing` flag, guaranteed visible. */}
        {refreshing.value ? (
          <View style={styles.refreshRow}>
            <ActivityIndicator color="#42b883" />
            <Text style={styles.accentNote}>Refreshing…</Text>
          </View>
        ) : (
          <Text style={styles.mutedCenter}>
            {`pull to refresh · refreshed ${refreshes.value}×`}
          </Text>
        )}

        {/* View + press-to-increment */}
        <View
          testID="counter-card"
          onPress={() => { count.value += 1 }}
          style={styles.counterCard}>
          <Text testID="counter-value" style={styles.counterText}>
            {`tapped ${count.value}×`}
          </Text>
        </View>

        {/* TextInput + greeting */}
        <TextInput
          testID="greeting-input"
          value={name.value}
          onChangeText={(text: string) => { name.value = text }}
          placeholder="type your name…"
          placeholderTextColor="#3b5266"
          style={styles.textInput}
        />
        <Text testID="greeting-output" style={styles.greeting}>
          {name.value ? `Hello, ${name.value}` : 'Hello, stranger'}
        </Text>

        {/* Switch drives the ActivityIndicator */}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>spinner</Text>
          <Switch
            testID="spinner-switch"
            value={spinning.value}
            onValueChange={(next: boolean) => { spinning.value = next }}
            trackColor={{ false: '#334155', true: '#369870' }}
          />
        </View>
        <ActivityIndicator testID="spinner-indicator" animating={spinning.value} color="#42b883" size="large" />

        {/* Animated: JS driver vs native driver, side by side */}
        <AnimatedDemo />

        {/* Animated: ValueXY, tracking, diffClamp */}
        <AnimatedParityDemo />

        {/* Runtime modules: I18nManager, Settings, Image statics */}
        <NativeModulesDemo />

        {/* Imperative host-ref API: measure / setNativeProps / findNodeHandle */}
        <RefApiDemo />

        {/* PlatformColor / DynamicColorIOS: native semantic + appearance-aware colors */}
        <PlatformColorDemo />

        {/* Accessibility: a11y props to native, aria/role transform, AccessibilityInfo */}
        <AccessibilityDemo />

        {/* Responder: drag-vs-tap + mid-gesture transfer (move-should-set / takeover) */}
        <ResponderDemo />

        {/* Parity checks: longPress · Keyboard.dismiss · animated scroll · sticky · a11y focus */}
        <ParityDemo />

        {/* Button opens a Modal */}
        <Button testID="modal-open" title="Open modal" onPress={() => { modalVisible.value = true }} color="#42b883" />

        {/* Pressable card with pressed-state feedback */}
        <Pressable
          onPress={() => { count.value += 1 }}
          style={({ pressed }: { pressed: boolean }) => [
            styles.pressableCard,
            {
              backgroundColor: pressed ? '#2c3e50' : '#22323f',
              borderColor: pressed ? '#42b883' : '#369870',
            },
          ]}>
          {({ pressed }: { pressed: boolean }) => (
            <Text style={[styles.pressableLabel, { color: pressed ? '#42b883' : '#cbd5e1' }]}>
              {pressed ? 'holding…' : 'press me (also +1)'}
            </Text>
          )}
        </Pressable>

        {/* Horizontal FlatList: real windowing */}
        <Text style={styles.sectionLabel}>FlatList · 24 chips, windowed</Text>
        <FlatList
          testID="chips-list"
          data={chips}
          horizontal={true}
          keyExtractor={(item: { id: string; index: number; color: string }) => item.id}
          getItemLayout={(_data: unknown, index: number) => ({
            length: CHIP_WIDTH + CHIP_GAP,
            offset: (CHIP_WIDTH + CHIP_GAP) * index,
            index,
          })}
          style={styles.chipList}
          renderItem={({ item }: { item: { id: string; index: number; color: string } }) => (
            <View style={[styles.chipCard, { backgroundColor: item.color }]}>
              <Text style={styles.chipNumber}>
                {item.index}
              </Text>
            </View>
          )}
        />

        {/* ===== feature-parity device checks ===== */}

        {/* Press-retention measured rect. PASS: press, then drag DOWN ~100px: the panel
            STAYS highlighted (inside the measured rect + 80px bottom retention). Drag UP
            off the top: highlight drops. Proves measured-rect retention rather than a
            symmetric-radius approximation. The dx/dy readout tracks the move offset. */}
        <Pressable
          hitSlop={{ top: 0, bottom: 40, left: 0, right: 0 }}
          pressRetentionOffset={{ top: 0, bottom: 80, left: 0, right: 0 }}
          onPressMove={(event: ISymbioteEvent) => {
            retentionMove.value = {
              dx: Math.round(nativeNumber(event, 'locationX')),
              dy: Math.round(nativeNumber(event, 'locationY')),
            }
          }}
          style={({ pressed }: { pressed: boolean }) => [
            styles.retentionCard,
            { backgroundColor: pressed ? '#369870' : '#2c3e50' },
          ]}>
          <Text style={styles.infoText}>
            {`drag me · dx ${retentionMove.value.dx} · dy ${retentionMove.value.dy}`}
          </Text>
        </Pressable>

        {/* maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows
            you are looking at DO NOT jump; new items appear above without shifting the
            viewport. FAIL: the list jumps to the top. */}
        <Text style={styles.sectionLabel}>MVCP · prepend without jump</Text>
        <FlatList
          data={mvcpItems.value}
          keyExtractor={(item: { id: string; label: string }) => item.id}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          style={styles.boxList160}
          renderItem={({ item }: { item: { id: string; label: string } }) => (
            <View style={styles.mvcpRow}>
              <Text style={styles.listRowText}>{item.label}</Text>
            </View>
          )}
        />
        <Button
          title="Prepend 5"
          color="#42b883"
          onPress={() => {
            mvcpHead -= 5
            const head = mvcpHead
            const prepended = Array.from({ length: 5 }, (_value, index) => {
              const n = head + index
              return { id: `row-${n}`, label: `item ${n}` }
            })
            mvcpItems.value = [...prepended, ...mvcpItems.value]
          }}
        />

        {/* Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the
            box below (not the page): the bright bar above SMOOTHLY fades to near-invisible
            and lifts, on the UI thread (no jank, no per-frame JS). Proves Animated.ScrollView
            + Animated.event native attach. */}
        <Animated.View
          style={[
            styles.parityHeader,
            {
              opacity: parityHeaderOpacity,
              transform: [{ translateY: parityHeaderTranslateY }],
            },
          ]}>
          <Text style={styles.parityHeaderText}>
            HEADER — fades as you scroll ↓
          </Text>
        </Animated.View>
        <Animated.ScrollView
          style={styles.boxList160}
          scrollEventThrottle={16}
          onScroll={onParityScroll}>
          {Array.from({ length: 6 }, (_value, index) => (
            <View key={index} style={styles.scrollDemoRow}>
              <Text style={styles.listRowText}>{`scroll me · row ${index}`}</Text>
            </View>
          ))}
        </Animated.ScrollView>
        <Text style={styles.tinyCenter}>
          ↑ drag inside the box — the bar above reacts
        </Text>
        {/* Native-driver proof for Animated.event: tap to JAM the JS thread 3s, then drag
            the box above DURING the freeze. If the bar keeps fading/lifting while JS is
            frozen, the scroll event drives parityScrollY on the UI thread (native attach).
            If it sticks until the thread frees, it was JS-driven. */}
        <Button
          title="Freeze JS 3s — then scroll the box ↑"
          color="#fc8181"
          onPress={() => {
            const until = Date.now() + 3000
            while (Date.now() < until) {
              // Intentionally block the JS thread: no JS frame can run here, so any
              // header motion during the freeze must be coming from the native driver.
            }
          }}
        />
        <Text style={styles.tinyCenter}>
          tap Freeze, then immediately drag the box — bar should still move
        </Text>

        {/* Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect
            is unmistakable on the dark theme. */}
        {/* boxShadow: a BLUE glow (a black shadow is invisible on the near-black bg).
            PASS: a soft blue halo bleeds out around the panel. */}
        <View style={styles.shadowCard}>
          <Text style={styles.noteText}>boxShadow · blue glow</Text>
        </View>
        {/* filter: same base colour both sides; the right one is darkened by
            brightness(0.5). PASS: the right panel is clearly darker than the left. */}
        <View style={styles.row}>
          <View style={styles.filterTile}>
            <Text style={styles.tileText}>no filter</Text>
          </View>
          <View style={[styles.filterTile, styles.dim]}>
            <Text style={styles.tileText}>brightness 0.5</Text>
          </View>
        </View>
        {/* transformOrigin: the panel rotates around its TOP-LEFT corner, not its centre.
            PASS: the left edge stays put while the bottom-right swings down. */}
        <View style={styles.rotatedCard}>
          <Text style={styles.tileText}>transformOrigin · top-left</Text>
        </View>

        {/* Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
            width/height→style); a screen reader reads "React logo" (alt→accessibilityLabel). */}
        <Image
          src="https://vuejs.org/images/logo.png"
          alt="React logo"
          width={48}
          height={48}
          style={styles.webImage}
        />

        {/* KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field
            lifts it above the keyboard AND the keyboard is the email layout (proves
            autoComplete/inputMode fold); with enabled OFF the keyboard covers the field. */}
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>avoid keyboard</Text>
          <Switch
            value={kavEnabled.value}
            onValueChange={(next: boolean) => { kavEnabled.value = next }}
            trackColor={{ false: '#334155', true: '#369870' }}
          />
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={kavEnabled.value}>
          <TextInput
            autoComplete="email"
            inputMode="email"
            enterKeyHint="done"
            placeholder="email — focus me near the bottom…"
            placeholderTextColor="#3b5266"
            style={styles.textInput}
          />
        </KeyboardAvoidingView>

        <Image
          source={{ uri: 'https://vuejs.org/images/logo.png' }}
          style={styles.logoImage}
        />

        <View style={styles.bottomCard}>
          <Text style={styles.bottomText}>↑ you scrolled to the bottom</Text>
        </View>

        {/* Modal overlays its own window */}
        <Modal
          visible={modalVisible.value}
          transparent={true}
          animationType="fade"
          onRequestClose={() => { modalVisible.value = false }}>
          {/* transparent modal => paint our own dim layer (the RN pattern) */}
          <View style={styles.modalOverlay}>
            <View testID="modal-card" style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                It's a Modal
              </Text>
              <Text style={styles.modalBody}>
                Rendered through ModalHostView — its own native window, same Fabric tree.
              </Text>
              <Button testID="modal-close" title="Close" onPress={() => { modalVisible.value = false }} color="#42b883" />
            </View>
          </View>
        </Modal>
      </ScrollView>
      </SafeAreaView>
    )
  },
})

// Static styles, extracted from the inline props above. Dynamic values (interpolations,
// pressed/active ternaries, PlatformColor, item.color, StyleSheet.hairlineWidth) stay at
// the use site, composed via `style={[styles.x, { …dynamic }]}`. Placed after the module
// consts it references (XY_SPAN / HEADER_COLLAPSE / PARITY_ROW_H / CHIP_*) so they're
// initialized before StyleSheet.create runs at module load.
const styles = StyleSheet.create({
  // shared / common
  screen: { flex: 1, backgroundColor: '#1b2a36' },
  scrollContent: { paddingVertical: 64, paddingHorizontal: 24, alignItems: 'stretch', gap: 28 },
  section: { gap: 12 },
  sectionTight: { gap: 8 },
  row: { flexDirection: 'row', gap: 12 },
  rowTight: { flexDirection: 'row', gap: 8 },
  flex1: { flex: 1 },
  sectionLabel: { color: '#3b5266', fontSize: 13 },
  infoText: { color: '#cbd5e1', fontSize: 14 },
  noteText: { color: '#cbd5e1', fontSize: 13 },
  switchLabel: { color: '#cbd5e1', fontSize: 16 },
  listRowText: { color: '#cbd5e1', fontSize: 15 },

  // the one allowed difference vs the React canary
  badge: { color: '#5fcf9b', fontSize: 14, letterSpacing: 2, textAlign: 'center' },

  // AnimatedDemo
  pulseFrame: { height: 64, alignItems: 'center', justifyContent: 'center' },
  pulseDot: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#42b883' },
  slideTrack: { height: 36, justifyContent: 'center' },
  jsSlideDot: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#f6ad55' },
  nativeSlideDot: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#68d391' },

  // AnimatedParityDemo
  dragHint: { color: '#718096', fontSize: 11 },
  xyFrame: { width: XY_SPAN + 36, height: XY_SPAN + 36, borderRadius: 12, backgroundColor: '#eef7f2', padding: 6 },
  xyBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#9f7aea' },
  trackRow: { height: 30, justifyContent: 'center' },
  leadDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#42b883' },
  followDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#f6ad55' },
  collapseFrame: { height: HEADER_COLLAPSE + 24, overflow: 'hidden', justifyContent: 'flex-start' },
  collapseHeader: { height: HEADER_COLLAPSE, borderRadius: 8, backgroundColor: '#38b2ac', alignItems: 'center', justifyContent: 'center' },
  collapseHeaderText: { color: 'white', fontSize: 12 },

  // NativeModulesDemo
  rowAlignCenter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#22323f' },
  infoTextFlex: { color: '#cbd5e1', fontSize: 14, flex: 1 },

  // RefApiDemo
  refBox: { height: 56, borderRadius: 12, backgroundColor: '#42b883', alignItems: 'center', justifyContent: 'center' },
  refBoxText: { color: '#1b2a36', fontSize: 14, fontWeight: 'bold' },

  // PlatformColorDemo
  colorTile: { flex: 1, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  colorTileBordered: { flex: 1, height: 56, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  boldLabel: { fontSize: 13, fontWeight: 'bold' },

  // ResponderDemo
  transferText: { fontSize: 13 },
  stripBox: { padding: 12, borderRadius: 12, backgroundColor: '#2c3e50' },
  chip: { width: 56, height: 48, borderRadius: 8, backgroundColor: '#369870', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chipText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },

  // AccessibilityDemo
  a11yCard: { padding: 12, borderRadius: 10, backgroundColor: '#2c3e50' },

  // ParityDemo
  longPressRow: { color: '#cbd5e1', fontSize: 15, padding: 12, borderRadius: 10, backgroundColor: '#2c3e50' },
  focusInput: { color: '#e2e8f0', padding: 12, borderRadius: 10, backgroundColor: '#22323f', borderWidth: 1, borderColor: '#369870' },
  parityList: { height: 120, borderRadius: 10, backgroundColor: '#22323f' },
  parityRow: { height: PARITY_ROW_H, justifyContent: 'center', paddingHorizontal: 12 },
  sectionList: { height: 200, borderRadius: 10, backgroundColor: '#22323f' },
  sectionHeader: { color: '#1b2a36', fontSize: 13, fontWeight: 'bold', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#42b883' },

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

export default App
