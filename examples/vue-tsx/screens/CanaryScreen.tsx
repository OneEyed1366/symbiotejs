// The "all primitives" canary, authored in Vue JSX (.tsx) — this is examples/vue-tsx/App.tsx's
// FORMER root content, relocated here as its own screen once @symbiote-native/navigation gave the
// app a real Menu as its initial route (mirrors examples/react/screens/CanaryScreen.tsx's same
// relocation). Reachable by pushing "All primitives (Canary)" from MenuScreen. @vue/babel-plugin-
// jsx compiles the JSX in each setup()'s render fn to @vue/runtime-core createVNode calls (Metro
// aliases 'vue' → @vue/runtime-core), so every vnode recommits through @symbiote-native/engine
// into Fabric, with React Native's own renderer never in the path. Same engine, same components,
// same palette as the React and SFC canaries; only the authoring differs — the proof the whole
// component surface is template-agnostic.
//
// Every primitive here (View, Text, ScrollView, TextInput, Image, Switch, ActivityIndicator,
// Button, Pressable, Modal, FlatList, SectionList, RefreshControl, …) comes from @symbiote-native/vue,
// not react-native. Kept monolithic on purpose (unlike the React canary, which split each demo
// section into its own components/*.tsx file) — this screen is a straight relocation of the
// pre-navigation App.tsx content, not a restructuring pass. Run with DEBUG=1 to watch each
// interaction commit incrementally (only the touched branch clones) in Metro's logs.

import {
  defineComponent,
  ref,
  shallowRef,
  onMounted,
  onUnmounted,
  type Ref,
} from 'vue';
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
  dlog,
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
  type IFlatListSlots,
  type ISectionListSlots,
  type ISection,
} from '@symbiote-native/vue';
// This file's metro.config.js aliases bare 'vue' straight to @vue/runtime-core (no transformer
// interception like the SFC examples get), so a plain `import { Teleport } from 'vue'` here
// would be the REAL, unguarded component. Import our validating wrapper explicitly instead.
import { Teleport } from '@symbiote-native/vue/runtime-helpers';
// A third-party native view (@react-native-community/slider) driven through symbiote's own
// wrapper — NOT the library's React component (which uses hooks and throws under Vue's null
// dispatcher). The engine derives RNCSlider's events + tint processors from the library's
// ViewConfig; the same wrapper backs the React canary. App code names only @symbiote-native/*.
import { Slider } from '@symbiote-native/slider/vue';
import { firstTouchX, nativeNumber } from '../components/event-utils';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { tunnelDemo } from '../tunnel-demo';

const CHIP_WIDTH = 72;
const CHIP_GAP = 12;
const REFRESH_MS = 2000;

const chips = Array.from({ length: 24 }, (_, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}));

const SLIDE_DISTANCE = 220;

// Animated, both drivers side by side. The pulse runs on the NATIVE driver: the
// curve lives in NativeAnimated, so zero JS runs per frame (DEBUG shows a single
// `native: startAnimatingNode`, no per-frame commits). The two slide dots run the
// SAME timing on different drivers: the JS one commits a clone every frame (DEBUG
// logs `commit … incremental` ~60×/run), the native one offloads it. Each dot keeps
// its own Animated.Value so a JS run and a native run never touch the same node.
const AnimatedDemo = defineComponent({
  name: 'AnimatedDemo',
  setup() {
    const pulse = new Animated.Value(0);
    const jsSlide = new Animated.Value(0);
    const nativeSlide = new Animated.Value(0);
    const jsForward = ref(false);
    const nativeForward = ref(false);

    // A perpetual native-driven heartbeat. A SINGLE looping timing offloads entirely
    // to native (iterations -1, zero JS per cycle); the 0->1 ramp becomes a breathe
    // in-and-out via the [0, 0.5, 1] interpolation, so no JS sequence is needed.
    const heartbeat = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
    );
    onMounted(() => heartbeat.start());
    onUnmounted(() => heartbeat.stop());

    const pulseScale = pulse.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [1, 1.3, 1],
    });
    const pulseOpacity = pulse.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.4, 1, 0.4],
    });

    const slide = (
      value: typeof jsSlide,
      forward: Ref<boolean>,
      useNativeDriver: boolean,
    ): void => {
      Animated.timing(value, {
        toValue: forward.value ? 0 : 1,
        duration: 600,
        useNativeDriver,
      }).start();
      forward.value = !forward.value;
    };

    const jsX = jsSlide.interpolate({
      inputRange: [0, 1],
      outputRange: [0, SLIDE_DISTANCE],
    });
    const nativeX = nativeSlide.interpolate({
      inputRange: [0, 1],
      outputRange: [0, SLIDE_DISTANCE],
    });

    // Proof of offload: kick both slides, then jam the JS thread for 1.5s.
    // The native-driven pulse + green slide keep moving on the UI side through the
    // freeze; the JS-driven orange slide stalls until the thread is released. If the
    // "native" path had silently fallen back to JS, the pulse would freeze too.
    const freezeJs = (): void => {
      slide(jsSlide, jsForward, false);
      slide(nativeSlide, nativeForward, true);
      const until = Date.now() + 1500;
      while (Date.now() < until) {
        // Intentionally block the JS thread: no requestAnimationFrame can fire here.
      }
    };

    return () => (
      <View class="section-nested">
        <Text class="section-label">Animated · JS vs native driver</Text>

        {/* native-driven perpetual pulse */}
        <View class="pulse-frame">
          <Animated.View
            testID="pulse-dot"
            class="pulse-dot"
            style={{
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            }}
          />
        </View>

        {/* JS-driven slide: a commit per frame */}
        <View class="slide-track">
          <Animated.View
            testID="slide-js-dot"
            class="js-slide-dot"
            style={{ transform: [{ translateX: jsX }] }}
          />
        </View>
        <Button
          testID="slide-js-btn"
          title="Slide (JS driver)"
          onPress={() => slide(jsSlide, jsForward, false)}
          color="#f6ad55"
        />

        {/* native-driven slide: offloaded, zero JS frames */}
        <View class="slide-track">
          <Animated.View
            testID="slide-native-dot"
            class="native-slide-dot"
            style={{ transform: [{ translateX: nativeX }] }}
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
    );
  },
});

// The rest of the Animated surface: ValueXY (2D), tracking (chase a moving target),
// and diffClamp (a collapsing header). Each is a thin port of the RN node.
const XY_SPAN = 96;
const TRACK_DISTANCE = 200;
const HEADER_COLLAPSE = 60;

const AnimatedParityDemo = defineComponent({
  name: 'AnimatedParityDemo',
  setup() {
    // --- ValueXY + PanResponder: drag the box, clamped inside the frame --------
    // Track the resting position in a plain object; each move sets the absolute position
    // (resting + gesture delta) clamped to [0, DRAG_MAX] so the box can't leave the
    // frame. DRAG_MAX = inner width (XY_SPAN+36 - 6*2 padding) - box (36).
    const DRAG_MAX = XY_SPAN - 12;
    const xy = new Animated.ValueXY({ x: 0, y: 0 });
    const restingPos = { x: 0, y: 0 };
    const clamp = (n: number): number => Math.max(0, Math.min(DRAG_MAX, n));
    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_event, gesture) => {
        xy.setValue({
          x: clamp(restingPos.x + gesture.dx),
          y: clamp(restingPos.y + gesture.dy),
        });
      },
      onPanResponderRelease: (_event, gesture) => {
        restingPos.x = clamp(restingPos.x + gesture.dx);
        restingPos.y = clamp(restingPos.y + gesture.dy);
      },
    });

    // --- Tracking: a follower spring-chases a lead value that animates on tap ---
    const lead = new Animated.Value(0);
    const follow = new Animated.Value(0);
    const leadForward = ref(false);
    onMounted(() => {
      // Set up once: follow tracks lead. Every lead change re-aims the spring, so the
      // follower lags and chases rather than jumping, the tracking signature.
      Animated.spring(follow, {
        toValue: lead,
        useNativeDriver: false,
      }).start();
    });
    onUnmounted(() => follow.stopAnimation());
    const moveLead = (): void => {
      Animated.timing(lead, {
        toValue: leadForward.value ? 0 : TRACK_DISTANCE,
        duration: 700,
        useNativeDriver: false,
      }).start();
      leadForward.value = !leadForward.value;
    };

    // --- diffClamp: a header that collapses as you scroll down, reveals on up ---
    const scroll = new Animated.Value(0);
    let scrollPos = 0;
    const headerOffset = Animated.diffClamp(
      scroll,
      0,
      HEADER_COLLAPSE,
    ).interpolate({
      inputRange: [0, HEADER_COLLAPSE],
      outputRange: [0, -HEADER_COLLAPSE],
    });
    const scrollBy = (delta: number): void => {
      scrollPos = Math.max(0, scrollPos + delta);
      Animated.timing(scroll, {
        toValue: scrollPos,
        duration: 180,
        useNativeDriver: false,
      }).start();
    };

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          Animated · ValueXY / tracking / diffClamp
        </Text>

        {/* ValueXY box you drag with a finger (PanResponder) */}
        <Text class="drag-hint">drag the purple box →</Text>
        {/* width/height dynamic: XY_SPAN script const, a CSS selector has no way to read */}
        <View
          class="xy-frame"
          style={{ width: XY_SPAN + 36, height: XY_SPAN + 36 }}
        >
          <Animated.View
            {...panResponder.panHandlers}
            class="xy-box"
            style={{ transform: xy.getTranslateTransform() }}
          />
        </View>

        {/* Tracking: lead dot (blue) and follower (orange) that lags behind it */}
        <View class="track-row">
          <Animated.View
            class="lead-dot"
            style={{ transform: [{ translateX: lead }] }}
          />
        </View>
        <View class="track-row">
          <Animated.View
            testID="follow-dot"
            class="follow-dot"
            style={{ transform: [{ translateX: follow }] }}
          />
        </View>
        <Button
          testID="track-btn"
          title="Move target (follower chases)"
          onPress={moveLead}
          color="#42b883"
        />

        {/* diffClamp collapsing header */}
        {/* height dynamic: HEADER_COLLAPSE script const */}
        <View class="collapse-frame" style={{ height: HEADER_COLLAPSE + 24 }}>
          <Animated.View
            class="collapse-header"
            style={{
              height: HEADER_COLLAPSE,
              transform: [{ translateY: headerOffset }],
            }}
          >
            <Text class="collapse-header-text">collapsing header</Text>
          </Animated.View>
        </View>
        <View class="row-tight">
          <View class="flex1">
            <Button
              title="Scroll ↓"
              onPress={() => scrollBy(40)}
              color="#38b2ac"
            />
          </View>
          <View class="flex1">
            <Button
              title="Scroll ↑"
              onPress={() => scrollBy(-40)}
              color="#38b2ac"
            />
          </View>
        </View>
      </View>
    );
  },
});

// Three runtime modules, each read live so it only resolves on a
// real host: I18nManager (RTL layout constants), Settings (a value round-tripped
// through iOS NSUserDefaults via SettingsManager), and Image's static methods
// (getSize / queryCache / prefetch, which hit the ImageLoader native module).
const LOGO_URI = 'https://vuejs.org/images/logo.png';
// A distinct cache key for the prefetch demo: same asset, different URL (query
// string), so nothing has loaded it yet. The cache starts cold and the button
// visibly warms it, unlike LOGO_URI, which getSize + the <Image> already pulled in.
const PREFETCH_URI = 'https://vuejs.org/images/logo.png?warm=symbiote';
const TAP_KEY = 'symbiote.tapCount';

const NativeModulesDemo = defineComponent({
  name: 'NativeModulesDemo',
  setup() {
    // I18nManager: RTL constants, read once at setup. A non-throwing read proves the
    // module name resolved; the values flip if you force RTL and relaunch.
    const rtl = I18nManager.getConstants();

    // Settings is a counter persisted to NSUserDefaults: read back on mount, bumped and
    // re-saved on tap, and watched so an external write to the key reflects live. It
    // survives a relaunch, which is the whole point of the module.
    const stored = Settings.get(TAP_KEY);
    const persisted = ref(typeof stored === 'number' ? stored : 0);
    let watchId: number | undefined;
    onMounted(() => {
      watchId = Settings.watchKeys(TAP_KEY, () => {
        const next = Settings.get(TAP_KEY);
        if (typeof next === 'number') persisted.value = next;
      });
    });
    onUnmounted(() => {
      if (watchId !== undefined) Settings.clearWatch(watchId);
    });
    const persistTap = (): void => {
      const next = persisted.value + 1;
      Settings.set({ [TAP_KEY]: next });
      persisted.value = next;
    };

    // Image statics: getSize resolves the rendered logo's real pixel dimensions
    // through ImageLoader (the <Image> below paints that same asset).
    const imageSize = ref('measuring…');
    onMounted(() => {
      Image.getSize(LOGO_URI)
        .then(({ width, height }) => {
          imageSize.value = `${width}×${height}px`;
        })
        .catch(() => {
          imageSize.value = 'unavailable';
        });
    });

    // Prefetch on a COLD url nothing has loaded: queryCache shows it absent, the
    // button warms it, and a re-query flips the readout, the visible effect.
    const cacheState = ref('checking…');
    const refreshCache = (): void => {
      Image.queryCache([PREFETCH_URI])
        .then(cache => {
          cacheState.value = cache[PREFETCH_URI] ?? 'not cached';
        })
        .catch(() => {
          cacheState.value = 'unavailable';
        });
    };
    onMounted(() => refreshCache());
    const prefetchLogo = (): void => {
      cacheState.value = 'prefetching…';
      void Image.prefetch(PREFETCH_URI)
        .then(() => refreshCache())
        .catch(() => {
          cacheState.value = 'unavailable';
        });
    };

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          Runtime modules · I18nManager / Settings / Image statics
        </Text>

        {/* I18nManager: RTL layout constants, read live */}
        <Text class="info-text">
          {`RTL: ${rtl.isRTL ? 'on' : 'off'} · swap L/R: ${rtl.doLeftAndRightSwapInRTL ? 'yes' : 'no'}`}
        </Text>
        <Button
          title={
            rtl.isRTL ? 'Force LTR (needs reload)' : 'Force RTL (needs reload)'
          }
          onPress={() => I18nManager.forceRTL(!rtl.isRTL)}
          color="#42b883"
        />

        {/* Settings: counter persisted to NSUserDefaults, survives a relaunch */}
        <Text testID="persist-count" class="info-text">
          {`persisted taps: ${persisted.value} · survives relaunch`}
        </Text>
        <Button
          testID="persist-btn"
          title="Persist a tap"
          onPress={persistTap}
          color="#42b883"
        />

        {/* Image statics: the rendered asset + getSize's measurement of it */}
        <View class="row-align-center">
          <Image source={{ uri: LOGO_URI }} class="logo-thumb" />
          <Text testID="logo-size" class="info-text-flex">
            {`logo size: ${imageSize.value}`}
          </Text>
        </View>
        {/* prefetch warms a cold url: not cached → (tap) → cached */}
        <Text class="info-text">{`prefetch cache: ${cacheState.value}`}</Text>
        <Button title="Prefetch logo" onPress={prefetchLogo} color="#42b883" />
      </View>
    );
  },
});

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
    const boxRef = shallowRef<IHostInstance | null>(null);
    let flashed = false;
    const frame = ref('tap “Measure”');
    const tag = ref<number | null>(null);

    onMounted(() => {
      // The tag exists only after the first commit, so read it post-mount.
      tag.value = findNodeHandle(boxRef.value);
    });

    const onMeasure = (): void => {
      const box = boxRef.value;
      if (box === null) return;
      box.measure((x, y, width, height, pageX, pageY) => {
        frame.value =
          `x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
          ` · page ${Math.round(pageX)},${Math.round(pageY)}`;
      });
    };

    const onFlash = (): void => {
      const box = boxRef.value;
      if (box === null) return;
      flashed = !flashed;
      box.setNativeProps({
        style: { backgroundColor: flashed ? '#f6ad55' : '#42b883' },
      });
    };

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          Imperative ref · measure / setNativeProps / findNodeHandle
        </Text>
        <View ref={boxRef} testID="ref-box" class="ref-box">
          <Text class="ref-box-text">{`native tag ${tag.value ?? '—'}`}</Text>
        </View>
        <Text
          testID="measure-frame"
          class="info-text"
        >{`frame: ${frame.value}`}</Text>
        <View class="row">
          <View class="flex1">
            <Button
              testID="measure-btn"
              title="Measure"
              onPress={onMeasure}
              color="#42b883"
            />
          </View>
          <View class="flex1">
            <Button
              title="Flash (setNativeProps)"
              onPress={onFlash}
              color="#f6ad55"
            />
          </View>
        </View>
      </View>
    );
  },
});

// PlatformColor / DynamicColorIOS resolve on the native side: 'systemBlue' / 'label'
// become iOS UIColor selectors, and the dynamic tuple flips with the system
// appearance. The opaque color objects flow through the same color seam as CSS
// strings (processColor), so no special handling reaches Fabric. Name resolution is
// device-only: a wrong name silently falls back, so this is verified on simulator.
const PlatformColorDemo = defineComponent({
  name: 'PlatformColorDemo',
  setup() {
    const scheme = useColorScheme();
    return () => (
      <View class="section-nested">
        <Text class="section-label">
          {`PlatformColor · semantic + DynamicColorIOS (${scheme.value ?? 'unknown'})`}
        </Text>
        <View class="row">
          {/* backgroundColor stays dynamic (PlatformColor is a runtime-resolved opaque color object) */}
          <View
            class="color-tile"
            style={{ backgroundColor: PlatformColor('systemBlue') }}
          >
            <Text class="tile-label">systemBlue</Text>
          </View>
          {/* backgroundColor / borderColor stay dynamic (DynamicColorIOS / PlatformColor) */}
          <View
            class="color-tile-bordered"
            style={{
              backgroundColor: DynamicColorIOS({
                light: '#dcf3e8',
                dark: '#2c3e50',
              }),
              borderColor: PlatformColor('separator'),
            }}
          >
            <Text class="bold-label" style={{ color: PlatformColor('label') }}>
              dynamic
            </Text>
          </View>
        </View>
      </View>
    );
  },
});

// Responder: the gesture capabilities exposed here, shown so the grabbed
// element is the one that moves. Each chip is its OWN responder: it grabs on touch
// start and drags ITSELF (onResponderMove translates that chip). Drag a chip past a
// threshold and the surrounding strip STEALS the gesture: its onMoveShouldSetResponder
// fires once the finger has travelled far enough, the chip yields (onResponder-
// TerminationRequest -> terminate, so it snaps back) and the strip pans the whole row.
// A small drag moves the digit; a big drag hands off to the strip: move-should-set and
// transfer, each visible (and the separate "transfer" line lights on the hand-off).
// DEBUG logcat shows "responder transferred ... -> ..." at that moment.
const RESPONDER_CHIPS = [0, 1, 2, 3, 4];
// Horizontal travel (in the touch's page units: px on Android, pt on iOS, so the feel
// differs a little per platform) after which the strip steals the gesture from the chip.
const RESPONDER_STEAL_DX = 64;

const ResponderDemo = defineComponent({
  name: 'ResponderDemo',
  setup() {
    const activeChip = ref<number | null>(null);
    const chipDx = ref(0);
    const rowDx = ref(0);
    const status = ref(
      'tap a chip · drag it to move · drag far → strip steals it',
    );
    const transfer = ref('');
    let startX = 0;
    let panStartX = 0;
    let grabbed: number | null = null;

    return () => (
      <View class="section-tight">
        <Text class="section-label">
          Responder · drag a chip vs hand-off to the strip
        </Text>
        <Text class="info-text">{status.value}</Text>
        {/* the separate transfer indicator, lit only when the strip steals the gesture;
            color stays dynamic (transfer.value ? active : idle) */}
        <Text
          class="transfer-text"
          style={{ color: transfer.value ? '#f6ad55' : '#3b5266' }}
        >
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
            transfer.value = `↯ strip stole the gesture from chip ${grabbed ?? '?'}`;
            activeChip.value = null;
            chipDx.value = 0;
            panStartX = firstTouchX(event);
            status.value = 'strip panning';
          }}
          onResponderMove={(event: ISymbioteEvent) => {
            rowDx.value = firstTouchX(event) - panStartX;
          }}
          onResponderRelease={() => {
            rowDx.value = 0;
            status.value = 'strip released';
          }}
          onResponderTerminate={() => {
            rowDx.value = 0;
          }}
          class="strip-box"
        >
          {/* transform stays dynamic (rowDx.value drives the strip pan) */}
          <View
            class="row-tight"
            style={{ transform: [{ translateX: rowDx.value }] }}
          >
            {RESPONDER_CHIPS.map(index => (
              <View
                key={index}
                testID={`resp-chip-${index}`}
                // Grabs on start and drags itself; yields to the strip past the threshold.
                onStartShouldSetResponder={() => true}
                onResponderGrant={(event: ISymbioteEvent) => {
                  startX = firstTouchX(event);
                  grabbed = index;
                  activeChip.value = index;
                  chipDx.value = 0;
                  rowDx.value = 0;
                  transfer.value = '';
                  status.value = `chip ${index} grabbed`;
                }}
                onResponderMove={(event: ISymbioteEvent) => {
                  const dx = firstTouchX(event) - startX;
                  chipDx.value = dx;
                  status.value = `chip ${index} moving · dx=${Math.round(dx)}`;
                }}
                onResponderTerminationRequest={() => true}
                onResponderTerminate={() => {
                  chipDx.value = 0;
                  activeChip.value = null;
                }}
                onResponderRelease={() => {
                  chipDx.value = 0;
                  activeChip.value = null;
                  status.value = `chip ${index} released`;
                }}
                class="chip"
                style={{
                  borderColor:
                    activeChip.value === index ? '#42b883' : 'transparent',
                  transform: [
                    {
                      translateX: activeChip.value === index ? chipDx.value : 0,
                    },
                  ],
                }}
              >
                <Text class="chip-text">{index}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  },
});

// Accessibility: the props reach native unchanged (accessibilityLabel -> Android
// content-desc / iOS accessibilityLabel; accessibilityState -> checked/selected/enabled),
// the web aria-*/role aliases FOLD to accessibility* in our wrapper (raw aria-* must
// never reach native), and AccessibilityInfo reads device state + drives announce.
// Verify on Android with `uiautomator dump` (content-desc / selected / enabled) and
// logcat for the announce + module-resolution dlogs; on iOS via Accessibility Inspector.
const AccessibilityDemo = defineComponent({
  name: 'AccessibilityDemo',
  setup() {
    const screenReader = ref('querying…');

    onMounted(() => {
      // A non-throwing getter proves the native module name resolved (Android
      // 'AccessibilityInfo' / iOS 'AccessibilityManager'); a reject means wrong name.
      AccessibilityInfo.isScreenReaderEnabled()
        .then(enabled => {
          screenReader.value = enabled ? 'on' : 'off';
        })
        .catch(() => {
          screenReader.value = 'unavailable';
        });
      AccessibilityInfo.announceForAccessibility(
        'symbiote accessibility online',
      );
    });

    return () => (
      <View class="section-nested">
        <Text class="section-label">
          Accessibility · props → native · aria/role transform ·
          AccessibilityInfo
        </Text>
        {/* getter readout: 'off' (no screen reader) proves the module resolved */}
        <Text class="info-text">{`screen reader: ${screenReader.value}`}</Text>
        {/* canonical accessibility*: content-desc 'a11y-canonical-label' + role=header */}
        <View
          accessible={true}
          accessibilityRole="header"
          accessibilityLabel="a11y-canonical-label"
          class="a11y-card"
        >
          <Text class="info-text">canonical label + role=header</Text>
        </View>
        {/* web aria and role aliases MUST fold: content-desc should be
            'a11y-aria-label', a raw aria-label attribute must not reach the native node */}
        <View
          accessible={true}
          role="button"
          aria-label="a11y-aria-label"
          class="a11y-card"
        >
          <Text class="info-text">aria-label + role=button</Text>
        </View>
        {/* accessibilityState: uiautomator shows enabled=false / selected=true */}
        <View
          accessible={true}
          accessibilityLabel="a11y-state"
          accessibilityState={{ disabled: true, selected: true }}
          class="a11y-card"
        >
          <Text class="info-text">state: disabled + selected</Text>
        </View>
      </View>
    );
  },
});

// Verification panel for five feature-parity behaviors with
// no prior canary surface: Text.onLongPress synthesis, Keyboard.dismiss (blur the
// focused input), animated VirtualizedList scroll, sticky SectionList headers, and
// Android setAccessibilityFocus. Each leaves a dlog seam (DEBUG=1 -> logcat) and a
// visible effect, so a real host confirms what the headless smokes prove in JS.
const PARITY_ROW_H = 30;
const parityRows = Array.from({ length: 30 }, (_unused, index) => ({
  id: `pr-${index}`,
  n: index,
}));
// Tall sections (taller than the list viewport) so the sticky cross-talk is visible: as
// you scroll, the next section header should reach the top and PUSH the pinned one off.
const sectionData = (
  prefix: string,
  label: string,
): { id: string; label: string }[] =>
  Array.from({ length: 8 }, (_unused, index) => ({
    id: `${prefix}${index}`,
    label: `${label} ${index}`,
  }));
const paritySections: ISection<{ id: string; label: string }>[] = [
  { title: 'Fruit', data: sectionData('f', 'apple') },
  { title: 'Tools', data: sectionData('t', 'hammer') },
  { title: 'Cities', data: sectionData('c', 'porto') },
];

const ParityDemo = defineComponent({
  name: 'ParityDemo',
  setup() {
    const listRef = shallowRef<IFlatListHandle | null>(null);
    const titleRef = shallowRef<IHostInstance | null>(null);
    const longPressMsg = ref('long-press or tap the row below');
    const dismissMsg = ref('focus the field, then Hide keyboard');

    return () => (
      <View class="section-nested">
        <Text ref={titleRef} class="section-label">
          Parity checks · longPress · dismiss · animated scroll · sticky · a11y
          focus
        </Text>

        {/* #10 Text.onLongPress synthesis: hold ~0.5s (suppresses tap) vs quick tap */}
        <Text
          onLongPress={() => {
            longPressMsg.value = 'long press! (tap was suppressed)';
          }}
          onPress={() => {
            longPressMsg.value = 'tap';
          }}
          class="long-press-row"
        >
          {longPressMsg.value}
        </Text>

        {/* #15 Keyboard.dismiss: blurs whatever input holds focus without needing a ref */}
        <TextInput
          placeholder="focus me…"
          placeholderTextColor="#3b5266"
          onFocus={() => {
            dismissMsg.value = 'keyboard up — tap Hide keyboard';
          }}
          onBlur={() => {
            dismissMsg.value = 'blurred (keyboard down)';
          }}
          class="focus-input"
        />
        <Text class="note-text">{dismissMsg.value}</Text>
        <Button
          title="Hide keyboard"
          onPress={() => Keyboard.dismiss()}
          color="#42b883"
        />

        {/* #12 animated VirtualizedList scroll: smooth (native command) vs instant.
            A fixed height with no wrapper: the vertical ScrollView clips to its own
            frame (overflow:'scroll' base, like RN), so rows stay inside the box on iOS too. */}
        <Text class="section-label">FlatList · animated scrollToOffset</Text>
        <FlatList
          ref={listRef}
          data={parityRows}
          // ItemT is INFERRED from `data` — keyExtractor's item is typed {id,n} with no annotation
          // (the generic defineComponent pattern). onViewableItemsChanged proves the SAME ItemT
          // flows into the emit payload: info.viewableItems[n].item is typed, not unknown.
          keyExtractor={item => item.id}
          getItemLayout={(_data: unknown, index: number) => ({
            length: PARITY_ROW_H,
            offset: PARITY_ROW_H * index,
            index,
          })}
          class="parity-list"
          onViewableItemsChanged={info => {
            dlog(
              `Vue FlatList viewable ${info.viewableItems.map(token => token.item.n).join(',')}`,
            );
          }}
        >
          {/* The cell is the #item scoped slot — Vue's idiom (no renderItem prop). `satisfies`
              types the slot object and keeps item inferred as {id,n}. */}
          {
            {
              item: ({ item }) => (
                // height stays dynamic: PARITY_ROW_H script const
                <View class="parity-row" style={{ height: PARITY_ROW_H }}>
                  <Text class="info-text">{`row ${item.n}`}</Text>
                </View>
              ),
            } satisfies IFlatListSlots<{ id: string; n: number }>
          }
        </FlatList>
        <View class="row">
          <View class="flex1">
            <Button
              title="Scroll ▼ animated"
              onPress={() =>
                listRef.value?.scrollToOffset({
                  offset: 20 * PARITY_ROW_H,
                  animated: true,
                })
              }
              color="#42b883"
            />
          </View>
          <View class="flex1">
            <Button
              title="Top · instant"
              onPress={() =>
                listRef.value?.scrollToOffset({ offset: 0, animated: false })
              }
              color="#42b883"
            />
          </View>
        </View>

        {/* #13 sticky section headers. Drag the inner list: each header pins at the top.
            Cross-talk check: as the NEXT header reaches the top it should PUSH the pinned
            one off (nextHeaderLayoutY not yet wired, watch push vs overlap). */}
        <Text class="section-label">
          SectionList · sticky (scroll: next header should push prev off)
        </Text>
        <SectionList
          testID="sticky-section-list"
          sections={paritySections}
          keyExtractor={(item: { id: string; label: string }) => item.id}
          stickySectionHeadersEnabled={true}
          class="section-list"
        >
          {/* #sectionHeader / #item scoped slots — `satisfies` keeps section & item typed. */}
          {
            {
              sectionHeader: ({ section }) => (
                <Text class="section-header">{section.title}</Text>
              ),
              item: ({ item }) => (
                // height stays dynamic: PARITY_ROW_H script const
                <View class="parity-row" style={{ height: PARITY_ROW_H }}>
                  <Text class="info-text">{item.label}</Text>
                </View>
              ),
            } satisfies ISectionListSlots<{ id: string; label: string }>
          }
        </SectionList>

        {/* #14 a11y focus: node-based sendAccessibilityEvent routes through the Fabric
            slot on both platforms (enable TalkBack/VoiceOver to feel the focus jump) */}
        <Button
          title="Focus the panel title (a11y)"
          onPress={() => {
            if (titleRef.value !== null) {
              AccessibilityInfo.sendAccessibilityEvent(titleRef.value, 'focus');
            }
          }}
          color="#42b883"
        />
      </View>
    );
  },
});

export const CanaryScreen = defineComponent({
  name: 'CanaryScreen',
  setup() {
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
    onUnmounted(() =>
      keyboardSubs.forEach(subscription => subscription.remove()),
    );

    // native -> JS: AppState pushes lifecycle changes; read the current phase live.
    let appStateSub: { remove(): void } | undefined;
    onMounted(() => {
      appStateSub = AppState.addEventListener(
        'change',
        (...args: unknown[]) => {
          const next = args[0];
          if (typeof next === 'string') appState.value = next;
        },
      );
    });
    onUnmounted(() => appStateSub?.remove());

    const onRefresh = (): void => {
      refreshing.value = true;
      setTimeout(() => {
        refreshing.value = false;
        refreshes.value += 1;
      }, REFRESH_MS);
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

    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];

    return () => (
      <SafeAreaView class="screen">
        <ScrollView
          testID="canary-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
          refreshControl={
            <RefreshControl
              refreshing={refreshing.value}
              onRefresh={onRefresh}
              tintColor="#42b883"
            />
          }
        >
          {/* JS->native: StatusBar renders nothing; it drives the iOS status bar
            (the top strip: clock, wi-fi, battery) imperatively from these props. */}
          <StatusBar
            barStyle={darkStatusBar.value ? 'dark-content' : 'light-content'}
            hidden={statusBarHidden.value}
            animated={true}
          />
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View
              class="hero-badge"
              style={{ backgroundColor: LINE_COLOR.primitives }}
            >
              <Text class="hero-badge-text">CN</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">All primitives</Text>
              <Text class="hero-body">
                Every @symbiote-native/vue primitive, driven straight onto
                Fabric — no react-native renderer in the path.
              </Text>
            </View>
          </View>
          {/* native->JS: keyboard height pushed from the device hub, read live */}
          <Text class="header-note">
            {keyboardHeight.value > 0
              ? `keyboard up · ${keyboardHeight.value}px`
              : 'keyboard down'}
          </Text>
          {/* Tier A runtime modules, read live from the real native side. A non-empty
            Version proves PlatformConstants resolved; a fractional hairline (e.g. 0.333
            on @3x) proves DeviceInfo's scale resolved. The border below IS that hairline;
            borderTopWidth stays dynamic (StyleSheet.hairlineWidth is a runtime constant). */}
          <Text
            class="hairline-note"
            style={{ borderTopWidth: StyleSheet.hairlineWidth }}
          >
            {`${Platform.OS} ${Platform.Version}` +
              `${Platform.isPad ? ' · iPad' : ''}` +
              ` · ${Platform.select({ ios: 'native ios', android: 'native android', default: '?' })}` +
              ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`}
          </Text>
          {/* Tier B runtime modules, live. Real w×h@scale proves Dimensions + PixelRatio;
            a colorScheme proves Appearance; appState flips when you background the app
            (AppState's device events). */}
          <Text class="header-note">
            {`${Math.round(window.value.width)}×${Math.round(window.value.height)} @${PixelRatio.get()}x` +
              ` · ${colorScheme.value ?? 'no-scheme'} · ${appState.value}`}
          </Text>
          {/* JS->native StatusBar controls: watch the top strip react */}
          <View class="row">
            <View class="flex1">
              <Button
                title={
                  statusBarHidden.value ? 'Show status bar' : 'Hide status bar'
                }
                onPress={() => {
                  statusBarHidden.value = !statusBarHidden.value;
                }}
                color="#42b883"
              />
            </View>
            <View class="flex1">
              <Button
                title={darkStatusBar.value ? 'Light text' : 'Dark text'}
                onPress={() => {
                  darkStatusBar.value = !darkStatusBar.value;
                }}
                color="#42b883"
              />
            </View>
          </View>
          {/* #6 Android-only window flags: the blank-risk pair. PASS: the top strip turns
            red / goes translucent and the app STAYS rendered. FAIL: the surface blanks
            (white screen); watch logcat for stopSurface / "reactInstance is null". */}
          {Platform.OS === 'android' && (
            <View class="row">
              <View class="flex1">
                <Button
                  title={statusBarRed.value ? 'BG default' : 'BG red'}
                  onPress={() => {
                    const next = !statusBarRed.value;
                    statusBarRed.value = next;
                    StatusBar.setBackgroundColor(
                      next ? '#ff0000' : '#22323f',
                      true,
                    );
                  }}
                  color="#42b883"
                />
              </View>
              <View class="flex1">
                <Button
                  title={statusBarTranslucent.value ? 'Opaque' : 'Translucent'}
                  onPress={() => {
                    const next = !statusBarTranslucent.value;
                    statusBarTranslucent.value = next;
                    StatusBar.setTranslucent(next);
                  }}
                  color="#42b883"
                />
              </View>
            </View>
          )}
          {/* JS->native imperative modules: tap to fire the real native UI / haptics.
            Each working button proves its module name resolved on the bridgeless host. */}
          <View class="row">
            <View class="flex1">
              <Button title="Alert" onPress={onAlert} color="#42b883" />
            </View>
            {/* ActionSheetIOS drives the iOS-only ActionSheetManager; no Android native
              module exists, so the control is iOS-only by design (not a gap). */}
            {Platform.OS !== 'android' && (
              <View class="flex1">
                <Button
                  title="Action sheet"
                  onPress={onActionSheet}
                  color="#42b883"
                />
              </View>
            )}
          </View>
          <View class="row">
            <View class="flex1">
              <Button title="Share" onPress={onShare} color="#42b883" />
            </View>
            <View class="flex1">
              <Button
                title="Vibrate"
                onPress={() => Vibration.vibrate()}
                color="#42b883"
              />
            </View>
          </View>
          <Button
            title="Open reactnative.dev"
            onPress={onOpenUrl}
            color="#42b883"
          />

          {/* The native UIRefreshControl spinner only shows while iOS holds the scroll
            view pulled-down; our full re-commit snaps the offset back, so we drive
            our OWN indicator from the same `refreshing` flag, guaranteed visible. */}
          {refreshing.value ? (
            <View class="refresh-row">
              <ActivityIndicator color="#42b883" />
              <Text class="accent-note">Refreshing…</Text>
            </View>
          ) : (
            <Text class="muted-center">
              {`pull to refresh · refreshed ${refreshes.value}×`}
            </Text>
          )}

          {/* View + press-to-increment */}
          <View
            testID="counter-card"
            onPress={() => {
              count.value += 1;
            }}
            class="counter-card"
          >
            <Text testID="counter-value" class="counter-text">
              {`tapped ${count.value}×`}
            </Text>
          </View>

          {/* TextInput + greeting */}
          <TextInput
            testID="greeting-input"
            value={name.value}
            onValueChange={(text: string) => {
              name.value = text;
            }}
            placeholder="type your name…"
            placeholderTextColor="#3b5266"
            class="text-input"
          />
          <Text testID="greeting-output" class="greeting">
            {name.value ? `Hello, ${name.value}` : 'Hello, stranger'}
          </Text>

          {/* Switch drives the ActivityIndicator */}
          <View class="switch-row">
            <Text class="switch-label">spinner</Text>
            <Switch
              testID="spinner-switch"
              value={spinning.value}
              onValueChange={(next: boolean) => {
                spinning.value = next;
              }}
              trackColor={{ false: '#334155', true: '#369870' }}
            />
          </View>
          <ActivityIndicator
            testID="spinner-indicator"
            animating={spinning.value}
            color="#42b883"
            size="large"
          />

          {/* Slider: the @react-native-community/slider native view via @symbiote-native/slider/vue. Drag
            it — onValueChange streams live; the colored track proves the engine ran the tint
            processors it derived from the library's ViewConfig. Same wrapper as the React canary. */}
          <View class="section-tight">
            <Text class="switch-label">
              {`volume · ${Math.round(volume.value * 100)}%`}
            </Text>
            <Slider
              testID="volume-slider"
              value={volume.value}
              onValueChange={(next: number) => {
                volume.value = next;
              }}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              minimumTrackTintColor="#42b883"
              maximumTrackTintColor="#334155"
              thumbTintColor="#ffffff"
              class="slider"
            />
          </View>

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
          <Button
            testID="modal-open"
            title="Open modal"
            onPress={() => {
              modalVisible.value = true;
            }}
            color="#42b883"
          />

          {/* Pressable card with pressed-state feedback */}
          <Pressable
            onPress={() => {
              count.value += 1;
            }}
            class="pressable-card"
            style={({ pressed }: { pressed: boolean }) => ({
              backgroundColor: pressed ? '#2c3e50' : '#22323f',
              borderColor: pressed ? '#42b883' : '#369870',
            })}
          >
            {({ pressed }: { pressed: boolean }) => (
              // color stays dynamic (pressed ? active : idle)
              <Text
                class="pressable-label"
                style={{ color: pressed ? '#42b883' : '#cbd5e1' }}
              >
                {pressed ? 'holding…' : 'press me (also +1)'}
              </Text>
            )}
          </Pressable>

          {/* Horizontal FlatList: real windowing */}
          <Text class="section-label">FlatList · 24 chips, windowed</Text>
          <FlatList
            testID="chips-list"
            data={chips}
            horizontal={true}
            keyExtractor={(item: {
              id: string;
              index: number;
              color: string;
            }) => item.id}
            getItemLayout={(_data: unknown, index: number) => ({
              length: CHIP_WIDTH + CHIP_GAP,
              offset: (CHIP_WIDTH + CHIP_GAP) * index,
              index,
            })}
            class="chip-list"
          >
            {/* The cell is the #item scoped slot — Vue's idiom (no renderItem prop). */}
            {
              {
                item: ({ item }) => (
                  // width / marginRight stay dynamic: CHIP_WIDTH/CHIP_GAP script consts;
                  // backgroundColor stays dynamic (item.color)
                  <View
                    class="chip-card"
                    style={{
                      width: CHIP_WIDTH,
                      marginRight: CHIP_GAP,
                      backgroundColor: item.color,
                    }}
                  >
                    <Text class="chip-number">{item.index}</Text>
                  </View>
                ),
              } satisfies IFlatListSlots<{
                id: string;
                index: number;
                color: string;
              }>
            }
          </FlatList>

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
              };
            }}
            class="retention-card"
            style={({ pressed }: { pressed: boolean }) => ({
              backgroundColor: pressed ? '#369870' : '#2c3e50',
            })}
          >
            <Text class="info-text">
              {`drag me · dx ${retentionMove.value.dx} · dy ${retentionMove.value.dy}`}
            </Text>
          </Pressable>

          {/* maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows
            you are looking at DO NOT jump; new items appear above without shifting the
            viewport. FAIL: the list jumps to the top. */}
          <Text class="section-label">MVCP · prepend without jump</Text>
          <FlatList
            data={mvcpItems.value}
            keyExtractor={(item: { id: string; label: string }) => item.id}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            class="box-list160"
          >
            {/* The cell is the #item scoped slot — Vue's idiom (no renderItem prop). */}
            {
              {
                item: ({ item }) => (
                  <View class="mvcp-row">
                    <Text class="list-row-text">{item.label}</Text>
                  </View>
                ),
              } satisfies IFlatListSlots<{ id: string; label: string }>
            }
          </FlatList>
          <Button
            title="Prepend 5"
            color="#42b883"
            onPress={() => {
              mvcpHead -= 5;
              const head = mvcpHead;
              const prepended = Array.from({ length: 5 }, (_value, index) => {
                const n = head + index;
                return { id: `row-${n}`, label: `item ${n}` };
              });
              mvcpItems.value = [...prepended, ...mvcpItems.value];
            }}
          />

          {/* Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the
            box below (not the page): the bright bar above SMOOTHLY fades to near-invisible
            and lifts, on the UI thread (no jank, no per-frame JS). Proves Animated.ScrollView
            + Animated.event native attach. */}
          {/* opacity / transform stay dynamic (the native-driver scroll interpolation) */}
          <Animated.View
            class="parity-header"
            style={{
              opacity: parityHeaderOpacity,
              transform: [{ translateY: parityHeaderTranslateY }],
            }}
          >
            <Text class="parity-header-text">
              HEADER — fades as you scroll ↓
            </Text>
          </Animated.View>
          <Animated.ScrollView
            class="box-list160"
            scrollEventThrottle={16}
            onScroll={onParityScroll}
          >
            {Array.from({ length: 6 }, (_value, index) => (
              <View key={index} class="scroll-demo-row">
                <Text class="list-row-text">{`scroll me · row ${index}`}</Text>
              </View>
            ))}
          </Animated.ScrollView>
          <Text class="tiny-center">
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
              const until = Date.now() + 3000;
              while (Date.now() < until) {
                // Intentionally block the JS thread: no JS frame can run here, so any
                // header motion during the freeze must be coming from the native driver.
              }
            }}
          />
          <Text class="tiny-center">
            tap Freeze, then immediately drag the box — bar should still move
          </Text>

          {/* Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect
            is unmistakable on the dark theme. Kept as a dynamic style object here — the CSS
            class form works equally well now (raw passthrough, 2026-07), see .gradient-card
            below, this is just legacy demo wiring, not a remaining gap. */}
          {/* boxShadow: a BLUE glow (a black shadow is invisible on the near-black bg).
            PASS: a soft blue halo bleeds out around the panel. */}
          <View class="shadow-card" style={shadowCardExtra}>
            <Text class="note-text">boxShadow · blue glow</Text>
          </View>
          {/* filter: same base colour both sides; the right one is darkened by
            brightness(0.5). PASS: the right panel is clearly darker than the left. */}
          <View class="row">
            <View class="filter-tile">
              <Text class="tile-text">no filter</Text>
            </View>
            <View class="filter-tile" style={dimStyle}>
              <Text class="tile-text">brightness 0.5</Text>
            </View>
          </View>
          {/* transformOrigin: the panel rotates around its TOP-LEFT corner, not its centre.
            PASS: the left edge stays put while the bottom-right swings down. */}
          <View class="rotated-card" style={rotationStyle}>
            <Text class="tile-text">transformOrigin · top-left</Text>
          </View>

          {/* background-image: a CSS `linear-gradient(...)` authored entirely in App.css
            (.gradient-card), proving @symbiote-native/css-parser's `background-image` → RN's
            `experimental_backgroundImage` raw passthrough works end to end.
            PASS: the panel shows a gradient sweeping left to right. */}
          <View class="gradient-card">
            <Text class="tile-text">background-image · linear-gradient</Text>
          </View>

          {/* Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
            width/height→style); a screen reader reads "React logo" (alt→accessibilityLabel). */}
          <Image
            src="https://vuejs.org/images/logo.png"
            alt="React logo"
            width={48}
            height={48}
            class="web-image"
          />

          {/* KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field
            lifts it above the keyboard AND the keyboard is the email layout (proves
            autoComplete/inputMode fold); with enabled OFF the keyboard covers the field. */}
          <View class="switch-row">
            <Text class="switch-label">avoid keyboard</Text>
            <Switch
              value={kavEnabled.value}
              onValueChange={(next: boolean) => {
                kavEnabled.value = next;
              }}
              trackColor={{ false: '#334155', true: '#369870' }}
            />
          </View>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            enabled={kavEnabled.value}
          >
            <TextInput
              autoComplete="email"
              inputMode="email"
              enterKeyHint="done"
              placeholder="email — focus me near the bottom…"
              placeholderTextColor="#3b5266"
              class="text-input"
            />
          </KeyboardAvoidingView>

          <Image
            source={{ uri: 'https://vuejs.org/images/logo.png' }}
            class="logo-image"
          />

          <View class="bottom-card">
            <Text class="bottom-text">↑ you scrolled to the bottom</Text>
          </View>

          {/* Modal overlays its own window */}
          <Modal
            visible={modalVisible.value}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {
              modalVisible.value = false;
            }}
          >
            {/* transparent modal => paint our own dim layer (the RN pattern) */}
            <View class="modal-overlay">
              <View testID="modal-card" class="modal-card">
                <Text class="modal-title">It's a Modal</Text>
                <Text class="modal-body">
                  Rendered through ModalHostView — its own native window, same
                  Fabric tree.
                </Text>
                <Button
                  testID="modal-close"
                  title="Close"
                  onPress={() => {
                    modalVisible.value = false;
                  }}
                  color="#42b883"
                />
              </View>
            </View>
          </Modal>

          {/* Teleport: moves the toast card OUT of this scroll content and INTO the
              overlay-host View rendered as a sibling of ScrollView below — same surface, so it
              repaints on the ONE patch this tree already does. This file's metro.config.js
              aliases 'vue' straight to @vue/runtime-core, so Teleport is imported explicitly
              from @symbiote-native/vue/runtime-helpers (its validating wrapper), not from 'vue'. */}
          <Button
            testID="toast-open"
            title="Show toast (Teleport)"
            onPress={() => {
              toastVisible.value = true;
            }}
            color="#42b883"
          />
          {overlayHost.value && (
            <Teleport to={overlayHost.value}>
              {toastVisible.value && (
                <View testID="toast-card" class="modal-card">
                  <Text class="modal-body">Ported via Teleport ✦</Text>
                  <Button
                    testID="toast-dismiss"
                    title="Dismiss"
                    onPress={() => {
                      toastVisible.value = false;
                    }}
                    color="#42b883"
                  />
                </View>
              )}
            </Teleport>
          )}

          {/* createTunnel: no ref, no target node — tunnelDemo.In just registers its slot
              content from wherever it's mounted; tunnelDemo.Out (rendered in the overlay host
              below) reads it back through its OWN normal render, wherever that happens to be
              mounted, even a different surface. tunnelDemo is the module-level singleton from
              ../tunnel-demo.ts. */}
          <Button
            testID="tunnel-toast-open"
            title="Show toast (createTunnel)"
            onPress={() => {
              tunnelToastVisible.value = true;
            }}
            color="#42b883"
          />
          {tunnelToastVisible.value && (
            <tunnelDemo.In>
              <View testID="tunnel-toast-card" class="modal-card">
                <Text class="modal-body">Ported via createTunnel ✦</Text>
                <Button
                  testID="tunnel-toast-dismiss"
                  title="Dismiss"
                  onPress={() => {
                    tunnelToastVisible.value = false;
                  }}
                  color="#42b883"
                />
              </View>
            </tunnelDemo.In>
          )}
        </ScrollView>

        {/* The Teleport/tunnel target: a persistent, empty View sitting above the scroll
            content. pointerEvents="box-none" lets touches pass through everywhere except an
            actual ported child (the toast card). Rendered here — a sibling of ScrollView, same
            surface — so Teleport above can reach it via the ref; createTunnel's Out below works
            identically wherever it's mounted. */}
        <View
          testID="overlay-host"
          ref={overlayHost}
          pointerEvents="box-none"
          class="overlay-host"
        >
          <tunnelDemo.Out />
        </View>
      </SafeAreaView>
    );
  },
});

// boxShadow / filter / transformOrigin+transform kept as plain style objects here (both forms
// work — see .gradient-card in App.css for the CSS-class equivalent).
const shadowCardExtra = {
  boxShadow: '0px 0px 22px 3px rgba(127,181,255,0.85)',
};
const dimStyle = { filter: [{ brightness: 0.5 }] };
const rotationStyle = {
  transformOrigin: 'top left',
  transform: [{ rotate: '4deg' }],
};
