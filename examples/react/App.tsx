/**
 * Symbiote canary app. Every primitive here (View, Text, ScrollView, TextInput,
 * Image, Switch, ActivityIndicator, Button, Pressable, Modal, FlatList,
 * RefreshControl) comes from @symbiote-native/react, not react-native. The tree is
 * rendered by our own react-reconciler host config straight onto Fabric; React
 * Native's renderer is never involved. Run with DEBUG=1 to watch each interaction
 * commit incrementally (created=0, only the touched branch clones) in Metro's logs.
 *
 * @format
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
} from '@symbiote-native/react';
// A real third-party native view, driven through symbiote's own wrapper (@symbiote-native/slider)
// rather than the library's React component: the wrapper registers RNCSlider's ViewConfig and
// renders the native leaf through the engine, so the SAME slider works on Vue/Angular too. App
// code and the app manifest name only @symbiote-native/slider; the native package is the wrapper's dep.
import { Slider } from '@symbiote-native/slider/react';
// Native splash screen, driven through symbiote's own wrapper (@symbiote-native/splash-screen)
// rather than react-native-bootsplash directly — hide() is a plain re-export from its
// framework-agnostic core, proving the imperative API is reachable from app code.
import { hide } from '@symbiote-native/splash-screen/react';
import './App.css';

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
function AnimatedDemo() {
  const pulse = useRef(new Animated.Value(0)).current;
  const jsSlide = useRef(new Animated.Value(0)).current;
  const nativeSlide = useRef(new Animated.Value(0)).current;
  const [jsForward, setJsForward] = useState(false);
  const [nativeForward, setNativeForward] = useState(false);

  // A perpetual native-driven heartbeat. A SINGLE looping timing offloads entirely
  // to native (iterations -1, zero JS per cycle); the 0->1 ramp becomes a breathe
  // in-and-out via the [0, 0.5, 1] interpolation, so no JS sequence is needed.
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

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
    forward: boolean,
    setForward: (next: boolean) => void,
    useNativeDriver: boolean,
  ): void => {
    Animated.timing(value, {
      toValue: forward ? 0 : 1,
      duration: 600,
      useNativeDriver,
    }).start();
    setForward(!forward);
  };

  const jsX = jsSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SLIDE_DISTANCE],
  });
  const nativeX = nativeSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SLIDE_DISTANCE],
  });

  // Proof that native-driven animation runs off the JS thread: kick both slides, then jam the JS thread for 1.5s.
  // The native-driven pulse + green slide keep moving on the UI side through the
  // freeze; the JS-driven orange slide stalls until the thread is released. If the
  // "native" path had silently fallen back to JS, the pulse would freeze too.
  const freezeJs = (): void => {
    slide(jsSlide, jsForward, setJsForward, false);
    slide(nativeSlide, nativeForward, setNativeForward, true);
    const until = Date.now() + 1500;
    while (Date.now() < until) {
      // Intentionally block the JS thread: no requestAnimationFrame can fire here.
    }
  };

  return (
    <View className="section">
      <Text className="section-label">Animated · JS vs native driver</Text>

      {/* native-driven perpetual pulse */}
      <View className="pulse-frame">
        <Animated.View
          testID="pulse-dot"
          className="pulse-dot"
          style={{ opacity: pulseOpacity, transform: [{ scale: pulseScale }] }}
        />
      </View>

      {/* JS-driven slide: a commit per frame */}
      <View className="slide-track">
        <Animated.View
          testID="slide-js-dot"
          className="js-slide-dot"
          style={{ transform: [{ translateX: jsX }] }}
        />
      </View>
      <Button
        testID="slide-js-btn"
        title="Slide (JS driver)"
        onPress={() => slide(jsSlide, jsForward, setJsForward, false)}
        color="#f6ad55"
      />

      {/* native-driven slide: offloaded, zero JS frames */}
      <View className="slide-track">
        <Animated.View
          testID="slide-native-dot"
          className="native-slide-dot"
          style={{ transform: [{ translateX: nativeX }] }}
        />
      </View>
      <Button
        testID="slide-native-btn"
        title="Slide (native driver)"
        onPress={() =>
          slide(nativeSlide, nativeForward, setNativeForward, true)
        }
        color="#68d391"
      />

      {/* Freeze the JS thread 1.5s: native (pulse + green) keep moving, JS (orange) stalls */}
      <Button title="Freeze JS 1.5s" onPress={freezeJs} color="#fc8181" />
    </View>
  );
}

// The rest of the Animated surface: ValueXY (2D), tracking (chase a moving target),
// and diffClamp (a collapsing header). Each is a thin port of the RN node.
const XY_SPAN = 96;
const TRACK_DISTANCE = 200;
const HEADER_COLLAPSE = 60;

function AnimatedParityDemo() {
  // --- ValueXY + PanResponder: drag the box, clamped inside the frame --------
  // Track the resting position in a ref; each move sets the absolute position
  // (resting + gesture delta) clamped to [0, DRAG_MAX] so the box can't leave the
  // frame. DRAG_MAX = inner width (XY_SPAN+36 - 6*2 padding) - box (36).
  const DRAG_MAX = XY_SPAN - 12;
  const xy = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const restingPos = useRef({ x: 0, y: 0 });
  const clamp = (n: number): number => Math.max(0, Math.min(DRAG_MAX, n));
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_event, gesture) => {
        xy.setValue({
          x: clamp(restingPos.current.x + gesture.dx),
          y: clamp(restingPos.current.y + gesture.dy),
        });
      },
      onPanResponderRelease: (_event, gesture) => {
        restingPos.current = {
          x: clamp(restingPos.current.x + gesture.dx),
          y: clamp(restingPos.current.y + gesture.dy),
        };
      },
    }),
  ).current;

  // --- Tracking: a follower spring-chases a lead value that animates on tap ---
  const lead = useRef(new Animated.Value(0)).current;
  const follow = useRef(new Animated.Value(0)).current;
  const [leadForward, setLeadForward] = useState(false);
  useEffect(() => {
    // Set up once: follow tracks lead. Every lead change re-aims the spring, so the
    // follower lags and chases rather than jumping, the tracking signature.
    Animated.spring(follow, { toValue: lead, useNativeDriver: false }).start();
    return () => follow.stopAnimation();
  }, [follow, lead]);
  const moveLead = (): void => {
    Animated.timing(lead, {
      toValue: leadForward ? 0 : TRACK_DISTANCE,
      duration: 700,
      useNativeDriver: false,
    }).start();
    setLeadForward(!leadForward);
  };

  // --- diffClamp: a header that collapses as you scroll down, reveals on up ---
  const scroll = useRef(new Animated.Value(0)).current;
  const scrollPos = useRef(0);
  const headerOffset = useRef(
    Animated.diffClamp(scroll, 0, HEADER_COLLAPSE).interpolate({
      inputRange: [0, HEADER_COLLAPSE],
      outputRange: [0, -HEADER_COLLAPSE],
    }),
  ).current;
  const scrollBy = (delta: number): void => {
    scrollPos.current = Math.max(0, scrollPos.current + delta);
    Animated.timing(scroll, {
      toValue: scrollPos.current,
      duration: 180,
      useNativeDriver: false,
    }).start();
  };

  return (
    <View className="section">
      <Text className="section-label">
        Animated · ValueXY / tracking / diffClamp
      </Text>

      {/* ValueXY box you drag with a finger (PanResponder) */}
      <Text className="drag-hint">drag the purple box →</Text>
      <View className="xy-frame">
        <Animated.View
          {...panResponder.panHandlers}
          className="xy-box"
          style={{ transform: xy.getTranslateTransform() }}
        />
      </View>

      {/* Tracking: lead dot (blue) and follower (orange) that lags behind it */}
      <View className="track-row">
        <Animated.View
          className="lead-dot"
          style={{ transform: [{ translateX: lead }] }}
        />
      </View>
      <View className="track-row">
        <Animated.View
          testID="follow-dot"
          className="follow-dot"
          style={{ transform: [{ translateX: follow }] }}
        />
      </View>
      <Button
        testID="track-btn"
        title="Move target (follower chases)"
        onPress={moveLead}
        color="#4299e1"
      />

      {/* diffClamp collapsing header */}
      <View className="collapse-frame">
        <Animated.View
          className="collapse-header"
          style={{ transform: [{ translateY: headerOffset }] }}
        >
          <Text className="collapse-header-text">collapsing header</Text>
        </Animated.View>
      </View>
      <View className="row-tight">
        <View className="flex1">
          <Button
            title="Scroll ↓"
            onPress={() => scrollBy(40)}
            color="#38b2ac"
          />
        </View>
        <View className="flex1">
          <Button
            title="Scroll ↑"
            onPress={() => scrollBy(-40)}
            color="#38b2ac"
          />
        </View>
      </View>
    </View>
  );
}

// Three runtime modules, each read live so it only resolves on a
// real host: I18nManager (RTL layout constants), Settings (a value round-tripped
// through iOS NSUserDefaults via SettingsManager), and Image's static methods
// (getSize / queryCache / prefetch, which hit the ImageLoader native module).
const LOGO_URI = 'https://reactnative.dev/img/tiny_logo.png';
// A distinct cache key for the prefetch demo: same asset, different URL (query
// string), so nothing has loaded it yet. The cache starts cold and the button
// visibly warms it, unlike LOGO_URI, which getSize + the <Image> already pulled in.
const PREFETCH_URI = 'https://reactnative.dev/img/tiny_logo.png?warm=symbiote';
const TAP_KEY = 'symbiote.tapCount';

function NativeModulesDemo() {
  // I18nManager: RTL constants, read once at render. A non-throwing read proves the
  // module name resolved; the values flip if you force RTL and relaunch.
  const rtl = I18nManager.getConstants();

  // Settings is a counter persisted to NSUserDefaults: read back on mount, bumped and
  // re-saved on tap, and watched so an external write to the key reflects live. It
  // survives a relaunch, which is the whole point of the module.
  const [persisted, setPersisted] = useState(() => {
    const stored = Settings.get(TAP_KEY);
    return typeof stored === 'number' ? stored : 0;
  });
  useEffect(() => {
    const watchId = Settings.watchKeys(TAP_KEY, () => {
      const stored = Settings.get(TAP_KEY);
      if (typeof stored === 'number') setPersisted(stored);
    });
    return () => Settings.clearWatch(watchId);
  }, []);
  const persistTap = (): void => {
    const next = persisted + 1;
    Settings.set({ [TAP_KEY]: next });
    setPersisted(next);
  };

  // Image statics: getSize resolves the rendered logo's real pixel dimensions
  // through ImageLoader (the <Image> below paints that same asset).
  const [imageSize, setImageSize] = useState('measuring…');
  useEffect(() => {
    Image.getSize(LOGO_URI)
      .then(({ width, height }) => setImageSize(`${width}×${height}px`))
      .catch(() => setImageSize('unavailable'));
  }, []);

  // Prefetch on a COLD url nothing has loaded: queryCache shows it absent, the
  // button warms it, and a re-query flips the readout, the visible effect.
  const [cacheState, setCacheState] = useState('checking…');
  const refreshCache = useCallback((): void => {
    Image.queryCache([PREFETCH_URI])
      .then(cache => setCacheState(cache[PREFETCH_URI] ?? 'not cached'))
      .catch(() => setCacheState('unavailable'));
  }, []);
  useEffect(() => refreshCache(), [refreshCache]);
  const prefetchLogo = (): void => {
    setCacheState('prefetching…');
    void Image.prefetch(PREFETCH_URI)
      .then(() => refreshCache())
      .catch(() => setCacheState('unavailable'));
  };

  return (
    <View className="section">
      <Text className="section-label">
        Runtime modules · I18nManager / Settings / Image statics
      </Text>

      {/* I18nManager: RTL layout constants, read live */}
      <Text className="info-text">
        {`RTL: ${rtl.isRTL ? 'on' : 'off'} · swap L/R: ${rtl.doLeftAndRightSwapInRTL ? 'yes' : 'no'}`}
      </Text>
      <Button
        title={
          rtl.isRTL ? 'Force LTR (needs reload)' : 'Force RTL (needs reload)'
        }
        onPress={() => I18nManager.forceRTL(!rtl.isRTL)}
        color="#7fb5ff"
      />

      {/* Settings: counter persisted to NSUserDefaults, survives a relaunch */}
      <Text testID="persist-count" className="info-text">
        {`persisted taps: ${persisted} · survives relaunch`}
      </Text>
      <Button
        testID="persist-btn"
        title="Persist a tap"
        onPress={persistTap}
        color="#7fb5ff"
      />

      {/* Image statics: the rendered asset + getSize's measurement of it. */}
      <View className="row-align-center">
        <Image source={{ uri: LOGO_URI }} className="logo-thumb" />
        <Text testID="logo-size" className="info-text-flex">
          {`logo size: ${imageSize}`}
        </Text>
      </View>
      {/* prefetch warms a cold url: not cached → (tap) → cached */}
      <Text className="info-text">{`prefetch cache: ${cacheState}`}</Text>
      <Button title="Prefetch logo" onPress={prefetchLogo} color="#7fb5ff" />
    </View>
  );
}

// Imperative host-ref API: the seam reanimated / gesture-handler reach through.
// `measure` returns the box's real on-screen frame (only a live host can answer it);
// `setNativeProps` recolors the box bypassing React entirely (no state, no re-render);
// `findNodeHandle` reads the committed native tag. The flash holds until the next React
// commit re-applies the declarative style, exactly RN's imperative-override semantics.
function RefApiDemo() {
  const boxRef = useRef<IHostInstance | null>(null);
  const flashedRef = useRef(false);
  const [frame, setFrame] = useState('tap “Measure”');
  const [tag, setTag] = useState<number | null>(null);

  useEffect(() => {
    // The tag exists only after the first commit, so read it post-mount.
    setTag(findNodeHandle(boxRef.current));
  }, []);

  const onMeasure = (): void => {
    const box = boxRef.current;
    if (box === null) return;
    box.measure((x, y, width, height, pageX, pageY) => {
      setFrame(
        `x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
          ` · page ${Math.round(pageX)},${Math.round(pageY)}`,
      );
    });
  };

  const onFlash = (): void => {
    const box = boxRef.current;
    if (box === null) return;
    flashedRef.current = !flashedRef.current;
    box.setNativeProps({
      style: { backgroundColor: flashedRef.current ? '#f6ad55' : '#7fb5ff' },
    });
  };

  return (
    <View className="section">
      <Text className="section-label">
        Imperative ref · measure / setNativeProps / findNodeHandle
      </Text>
      <View ref={boxRef} testID="ref-box" className="ref-box">
        <Text className="ref-box-text">{`native tag ${tag ?? '—'}`}</Text>
      </View>
      <Text
        testID="measure-frame"
        className="info-text"
      >{`frame: ${frame}`}</Text>
      <View className="row">
        <View className="flex1">
          <Button
            testID="measure-btn"
            title="Measure"
            onPress={onMeasure}
            color="#7fb5ff"
          />
        </View>
        <View className="flex1">
          <Button
            title="Flash (setNativeProps)"
            onPress={onFlash}
            color="#f6ad55"
          />
        </View>
      </View>
    </View>
  );
}

// PlatformColor / DynamicColorIOS resolve on the native side: 'systemBlue' / 'label'
// become iOS UIColor selectors, and the dynamic tuple flips with the system
// appearance. The opaque color objects flow through the same color seam as CSS
// strings (processColor), so no special handling reaches Fabric. Name resolution is
// device-only: a wrong name silently falls back, so this is verified on simulator.
function PlatformColorDemo() {
  const scheme = useColorScheme();
  return (
    <View className="section">
      <Text className="section-label">
        {`PlatformColor · semantic + DynamicColorIOS (${scheme ?? 'unknown'})`}
      </Text>
      <View className="row">
        <View
          className="color-tile"
          style={{ backgroundColor: PlatformColor('systemBlue') }}
        >
          <Text className="tile-label">systemBlue</Text>
        </View>
        <View
          className="color-tile-bordered"
          style={{
            backgroundColor: DynamicColorIOS({
              light: '#dbeafe',
              dark: '#13243a',
            }),
            borderColor: PlatformColor('separator'),
          }}
        >
          <Text
            className="bold-label"
            style={{ color: PlatformColor('label') }}
          >
            dynamic
          </Text>
        </View>
      </View>
    </View>
  );
}

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

function firstTouchX(event: ISymbioteEvent): number {
  const touches = event.nativeEvent.touches;
  if (!Array.isArray(touches) || touches.length === 0) return 0;
  const first: unknown = touches[0];
  if (typeof first === 'object' && first !== null && 'pageX' in first) {
    const pageX = first.pageX;
    return typeof pageX === 'number' ? pageX : 0;
  }
  return 0;
}

// nativeEvent is a framework-agnostic Record<string, unknown>, so a numeric field
// (locationX/locationY…) arrives untyped, narrow it here instead of casting.
function nativeNumber(event: ISymbioteEvent, key: string): number {
  const value = event.nativeEvent[key];
  return typeof value === 'number' ? value : 0;
}

function ResponderDemo() {
  const [activeChip, setActiveChip] = useState<number | null>(null);
  const [chipDx, setChipDx] = useState(0);
  const [rowDx, setRowDx] = useState(0);
  const [status, setStatus] = useState(
    'tap a chip · drag it to move · drag far → strip steals it',
  );
  const [transfer, setTransfer] = useState('');
  const startX = useRef(0);
  const panStartX = useRef(0);
  const grabbed = useRef<number | null>(null);

  return (
    <View className="section-tight">
      <Text className="section-label">
        Responder · drag a chip vs hand-off to the strip
      </Text>
      <Text className="info-text">{status}</Text>
      {/* the separate transfer indicator, lit only when the strip steals the gesture */}
      <Text
        className="transfer-text"
        style={{ color: transfer ? '#f6ad55' : '#41506a' }}
      >
        {transfer || 'transfer: —'}
      </Text>
      <View
        // Claims the gesture only once the finger has travelled past the threshold,
        // stealing it from whichever chip currently holds it, the transfer path.
        onMoveShouldSetResponder={event =>
          grabbed.current !== null &&
          Math.abs(firstTouchX(event) - startX.current) > RESPONDER_STEAL_DX
        }
        onResponderGrant={event => {
          setTransfer(
            `↯ strip stole the gesture from chip ${grabbed.current ?? '?'}`,
          );
          setActiveChip(null);
          setChipDx(0);
          panStartX.current = firstTouchX(event);
          setStatus('strip panning');
        }}
        onResponderMove={event =>
          setRowDx(firstTouchX(event) - panStartX.current)
        }
        onResponderRelease={() => {
          setRowDx(0);
          setStatus('strip released');
        }}
        onResponderTerminate={() => setRowDx(0)}
        className="strip-box"
      >
        <View
          className="row-tight"
          style={{ transform: [{ translateX: rowDx }] }}
        >
          {RESPONDER_CHIPS.map(index => (
            <View
              key={index}
              testID={`resp-chip-${index}`}
              // Grabs on start and drags itself; yields to the strip past the threshold.
              onStartShouldSetResponder={() => true}
              onResponderGrant={event => {
                startX.current = firstTouchX(event);
                grabbed.current = index;
                setActiveChip(index);
                setChipDx(0);
                setRowDx(0);
                setTransfer('');
                setStatus(`chip ${index} grabbed`);
              }}
              onResponderMove={event => {
                const dx = firstTouchX(event) - startX.current;
                setChipDx(dx);
                setStatus(`chip ${index} moving · dx=${Math.round(dx)}`);
              }}
              onResponderTerminationRequest={() => true}
              onResponderTerminate={() => {
                setChipDx(0);
                setActiveChip(null);
              }}
              onResponderRelease={() => {
                setChipDx(0);
                setActiveChip(null);
                setStatus(`chip ${index} released`);
              }}
              className="chip"
              style={{
                borderColor: activeChip === index ? '#7fb5ff' : 'transparent',
                transform: [{ translateX: activeChip === index ? chipDx : 0 }],
              }}
            >
              <Text className="chip-text">{index}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// Accessibility: the props reach native unchanged (accessibilityLabel -> Android
// content-desc / iOS accessibilityLabel; accessibilityState -> checked/selected/enabled),
// the web aria-*/role aliases FOLD to accessibility* in our wrapper (raw aria-* must
// never reach native), and AccessibilityInfo reads device state + drives announce.
// Verify on Android with `uiautomator dump` (content-desc / selected / enabled) and
// logcat for the announce + module-resolution dlogs; on iOS via Accessibility Inspector.
function AccessibilityDemo() {
  const [screenReader, setScreenReader] = useState('querying…');

  useEffect(() => {
    // A non-throwing getter proves the native module name resolved (Android
    // 'AccessibilityInfo' / iOS 'AccessibilityManager'); a reject means wrong name.
    AccessibilityInfo.isScreenReaderEnabled()
      .then(enabled => setScreenReader(enabled ? 'on' : 'off'))
      .catch(() => setScreenReader('unavailable'));
    AccessibilityInfo.announceForAccessibility('symbiote accessibility online');
  }, []);

  return (
    <View className="section">
      <Text className="section-label">
        Accessibility · props → native · aria/role transform · AccessibilityInfo
      </Text>
      {/* getter readout: 'off' (no screen reader) proves the module resolved */}
      <Text className="info-text">{`screen reader: ${screenReader}`}</Text>
      {/* canonical accessibility*: content-desc 'a11y-canonical-label' + role=header */}
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel="a11y-canonical-label"
        className="a11y-card"
      >
        <Text className="info-text">canonical label + role=header</Text>
      </View>
      {/* web aria and role aliases MUST fold: content-desc should be
          'a11y-aria-label', a raw aria-label attribute must not reach the native node */}
      <View
        accessible
        role="button"
        aria-label="a11y-aria-label"
        className="a11y-card"
      >
        <Text className="info-text">aria-label + role=button</Text>
      </View>
      {/* accessibilityState: uiautomator shows enabled=false / selected=true */}
      <View
        accessible
        accessibilityLabel="a11y-state"
        accessibilityState={{ disabled: true, selected: true }}
        className="a11y-card"
      >
        <Text className="info-text">state: disabled + selected</Text>
      </View>
    </View>
  );
}

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

function ParityDemo() {
  const listRef = useRef<IFlatListHandle>(null);
  const titleRef = useRef<IHostInstance>(null);
  const [longPressMsg, setLongPressMsg] = useState(
    'long-press or tap the row below',
  );
  const [dismissMsg, setDismissMsg] = useState(
    'focus the field, then Hide keyboard',
  );

  return (
    <View className="section">
      <Text ref={titleRef} className="section-label">
        Parity checks · longPress · dismiss · animated scroll · sticky · a11y
        focus
      </Text>

      {/* #10 Text.onLongPress synthesis: hold ~0.5s (suppresses tap) vs quick tap */}
      <Text
        onLongPress={() => setLongPressMsg('long press! (tap was suppressed)')}
        onPress={() => setLongPressMsg('tap')}
        className="long-press-row"
      >
        {longPressMsg}
      </Text>

      {/* #15 Keyboard.dismiss: blurs whatever input holds focus without needing a ref. */}
      <TextInput
        placeholder="focus me…"
        placeholderTextColor="#41506a"
        onFocus={() => setDismissMsg('keyboard up — tap Hide keyboard')}
        onBlur={() => setDismissMsg('blurred (keyboard down)')}
        className="focus-input"
      />
      <Text className="note-text">{dismissMsg}</Text>
      <Button
        title="Hide keyboard"
        onPress={() => Keyboard.dismiss()}
        color="#7fb5ff"
      />

      {/* #12 animated VirtualizedList scroll: smooth (native command) vs instant.
          A fixed height with no wrapper: the vertical ScrollView clips to its own
          frame (overflow:'scroll' base, like RN), so rows stay inside the box on iOS too. */}
      <Text className="section-label">FlatList · animated scrollToOffset</Text>
      <FlatList
        ref={listRef}
        data={parityRows}
        keyExtractor={item => item.id}
        getItemLayout={(_data, index) => ({
          length: PARITY_ROW_H,
          offset: PARITY_ROW_H * index,
          index,
        })}
        className="parity-list"
        renderItem={({ item }) => (
          // parityRow's height references the script const PARITY_ROW_H, which a
          // CSS selector has no way to read — that one property stays dynamic
          // alongside the static `className="parity-row"` for justifyContent/padding.
          <View className="parity-row" style={{ height: PARITY_ROW_H }}>
            <Text className="info-text">{`row ${item.n}`}</Text>
          </View>
        )}
      />
      <View className="row">
        <View className="flex1">
          <Button
            title="Scroll ▼ animated"
            onPress={() =>
              listRef.current?.scrollToOffset({
                offset: 20 * PARITY_ROW_H,
                animated: true,
              })
            }
            color="#7fb5ff"
          />
        </View>
        <View className="flex1">
          <Button
            title="Top · instant"
            onPress={() =>
              listRef.current?.scrollToOffset({ offset: 0, animated: false })
            }
            color="#7fb5ff"
          />
        </View>
      </View>

      {/* #13 sticky section headers. Drag the inner list: each header pins at the top.
          Cross-talk check: as the NEXT header reaches the top it should PUSH the pinned
          one off (nextHeaderLayoutY not yet wired, watch push vs overlap). */}
      <Text className="section-label">
        SectionList · sticky (scroll: next header should push prev off)
      </Text>
      <SectionList
        testID="sticky-section-list"
        sections={paritySections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled
        className="section-list"
        renderSectionHeader={({ section }) => (
          <Text className="section-header">{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <View className="parity-row" style={{ height: PARITY_ROW_H }}>
            <Text className="info-text">{item.label}</Text>
          </View>
        )}
      />

      {/* #14 a11y focus: node-based sendAccessibilityEvent routes through the Fabric
          slot on both platforms (enable TalkBack/VoiceOver to feel the focus jump) */}
      <Button
        title="Focus the panel title (a11y)"
        onPress={() => {
          if (titleRef.current !== null) {
            AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
          }
        }}
        color="#7fb5ff"
      />
    </View>
  );
}

function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');
  const [spinning, setSpinning] = useState(true);
  const [volume, setVolume] = useState(0.5);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshes, setRefreshes] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [statusBarHidden, setStatusBarHidden] = useState(false);
  const [darkStatusBar, setDarkStatusBar] = useState(false);
  // #6 Android-only StatusBar window flags: the blank-risk pair (device-verify-pending).
  const [statusBarRed, setStatusBarRed] = useState(false);
  const [statusBarTranslucent, setStatusBarTranslucent] = useState(false);

  // Feature-parity device checks: state for the cluster before the final logo.
  const [retentionMove, setRetentionMove] = useState({ dx: 0, dy: 0 });
  const [mvcpItems, setMvcpItems] = useState(() =>
    Array.from({ length: 20 }, (_value, index) => ({
      id: `row-${index}`,
      label: `item ${index}`,
    })),
  );
  const mvcpHead = useRef(0);
  // native-driver scroll value: Animated.event attaches it on the UI thread, so the
  // header opacity/translateY are driven without a JS frame per scroll tick.
  const parityScrollY = useRef(new Animated.Value(0)).current;
  const [kavEnabled, setKavEnabled] = useState(true);

  // Tier B runtime modules, read live: the hooks pull from Dimensions/Appearance,
  // appState tracks foreground/background through AppState's device events.
  const window = useWindowDimensions();
  const colorScheme = useColorScheme();
  const [appState, setAppState] = useState<string>(
    AppState.currentState ?? 'unknown',
  );

  // Native splash screen was shown at launch (initWithStoryboard/init in the native
  // bootstrap); hide it once the JS tree has mounted.
  useEffect(() => {
    hide();
  }, []);

  // native -> JS: the device hub pushes keyboard frames; we read the height live.
  useEffect(() => {
    const onShow = (payload: unknown) => {
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
      setKeyboardHeight(height);
    };
    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () => setKeyboardHeight(0)),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);

  // native -> JS: AppState pushes lifecycle changes; read the current phase live.
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (...args: unknown[]) => {
        const next = args[0];
        if (typeof next === 'string') setAppState(next);
      },
    );
    return () => subscription.remove();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setRefreshes(value => value + 1);
    }, REFRESH_MS);
  }, []);

  // JS -> native imperative modules. A Promise reject (no native module / user
  // cancel) is expected, so it's swallowed; this is a demo, not a flow to handle.
  const onShare = useCallback(() => {
    void Share.share({
      message: 'Sent from symbiote',
      url: 'https://reactnative.dev',
    }).catch(() => {});
  }, []);
  const onAlert = useCallback(() => {
    Alert.alert('symbiote', 'Native AlertManager reached.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Vibrate', onPress: () => Vibration.vibrate() },
    ]);
  }, []);
  const onActionSheet = useCallback(() => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Share', 'Vibrate', 'Cancel'], cancelButtonIndex: 2 },
      (index: number) => {
        if (index === 0) onShare();
        if (index === 1) Vibration.vibrate();
      },
    );
  }, [onShare]);
  const onOpenUrl = useCallback(() => {
    void Linking.openURL('https://reactnative.dev').catch(() => {});
  }, []);

  return (
    <SafeAreaView className="screen">
      <ScrollView
        testID="canary-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7fb5ff"
          />
        }
      >
        {/* JS->native: StatusBar renders nothing; it drives the iOS status bar
          (the top strip: clock, wi-fi, battery) imperatively from these props. */}
        <StatusBar
          barStyle={darkStatusBar ? 'dark-content' : 'light-content'}
          hidden={statusBarHidden}
          animated
        />
        <Text className="title">symbiote · all primitives</Text>
        {/* native->JS: keyboard height pushed from the device hub, read live */}
        <Text className="header-note">
          {keyboardHeight > 0
            ? `keyboard up · ${keyboardHeight}px`
            : 'keyboard down'}
        </Text>
        {/* Tier A runtime modules, read live from the real native side. A non-empty
          Version proves PlatformConstants resolved; a fractional hairline (e.g. 0.333
          on @3x) proves DeviceInfo's scale resolved. The border below IS that hairline.
          borderTopWidth stays dynamic (StyleSheet.hairlineWidth is a runtime constant). */}
        <Text
          className="hairline-note"
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
        <Text className="header-note">
          {`${Math.round(window.width)}×${Math.round(window.height)} @${PixelRatio.get()}x` +
            ` · ${colorScheme ?? 'no-scheme'} · ${appState}`}
        </Text>
        {/* JS->native StatusBar controls: watch the top strip react */}
        <View className="row">
          <View className="flex1">
            <Button
              title={statusBarHidden ? 'Show status bar' : 'Hide status bar'}
              onPress={() => setStatusBarHidden(value => !value)}
              color="#7fb5ff"
            />
          </View>
          <View className="flex1">
            <Button
              title={darkStatusBar ? 'Light text' : 'Dark text'}
              onPress={() => setDarkStatusBar(value => !value)}
              color="#7fb5ff"
            />
          </View>
        </View>
        {/* #6 Android-only window flags: the blank-risk pair. PASS: the top strip turns
          red / goes translucent and the app STAYS rendered. FAIL: the surface blanks
          (white screen); watch logcat for stopSurface / "reactInstance is null". */}
        {Platform.OS === 'android' && (
          <View className="row">
            <View className="flex1">
              <Button
                title={statusBarRed ? 'BG default' : 'BG red'}
                onPress={() => {
                  const next = !statusBarRed;
                  setStatusBarRed(next);
                  StatusBar.setBackgroundColor(
                    next ? '#ff0000' : '#101a2c',
                    true,
                  );
                }}
                color="#7fb5ff"
              />
            </View>
            <View className="flex1">
              <Button
                title={statusBarTranslucent ? 'Opaque' : 'Translucent'}
                onPress={() => {
                  const next = !statusBarTranslucent;
                  setStatusBarTranslucent(next);
                  StatusBar.setTranslucent(next);
                }}
                color="#7fb5ff"
              />
            </View>
          </View>
        )}
        {/* JS->native imperative modules: tap to fire the real native UI / haptics.
          Each working button proves its module name resolved on the bridgeless host. */}
        <View className="row">
          <View className="flex1">
            <Button title="Alert" onPress={onAlert} color="#7fb5ff" />
          </View>
          {/* ActionSheetIOS drives the iOS-only ActionSheetManager; no Android native
            module exists, so the control is iOS-only by design (not a gap). */}
          {Platform.OS !== 'android' && (
            <View className="flex1">
              <Button
                title="Action sheet"
                onPress={onActionSheet}
                color="#7fb5ff"
              />
            </View>
          )}
        </View>
        <View className="row">
          <View className="flex1">
            <Button title="Share" onPress={onShare} color="#7fb5ff" />
          </View>
          <View className="flex1">
            <Button
              title="Vibrate"
              onPress={() => Vibration.vibrate()}
              color="#7fb5ff"
            />
          </View>
        </View>
        <Button
          title="Open reactnative.dev"
          onPress={onOpenUrl}
          color="#7fb5ff"
        />

        {/* The native UIRefreshControl spinner only shows while iOS holds the scroll
          view pulled-down; our full re-commit snaps the offset back, so we drive
          our OWN indicator from the same `refreshing` flag, guaranteed visible. */}
        {refreshing ? (
          <View className="refresh-row">
            <ActivityIndicator color="#7fb5ff" />
            <Text className="accent-note">Refreshing…</Text>
          </View>
        ) : (
          <Text className="muted-center">
            {`pull to refresh · refreshed ${refreshes}×`}
          </Text>
        )}

        {/* View + press-to-increment */}
        <View
          testID="counter-card"
          onPress={() => setCount(value => value + 1)}
          className="counter-card"
        >
          <Text testID="counter-value" className="counter-text">
            {`tapped ${count}×`}
          </Text>
        </View>

        {/* TextInput + greeting. text-input is shared with the KAV email field below. */}
        <TextInput
          testID="greeting-input"
          value={name}
          onValueChange={setName}
          placeholder="type your name…"
          placeholderTextColor="#41506a"
          className="text-input"
        />
        <Text testID="greeting-output" className="greeting">
          {name ? `Hello, ${name}` : 'Hello, stranger'}
        </Text>

        {/* Switch drives the ActivityIndicator */}
        <View className="switch-row">
          <Text className="switch-label">spinner</Text>
          <Switch
            testID="spinner-switch"
            value={spinning}
            onValueChange={setSpinning}
            trackColor={{ false: '#334155', true: '#2b6cb0' }}
          />
        </View>
        <ActivityIndicator
          testID="spinner-indicator"
          animating={spinning}
          color="#7fb5ff"
          size="large"
        />

        {/* Slider: a THIRD-PARTY native view (@react-native-community/slider) driven via the
          @symbiote-native/slider native-proxy wrapper. The engine derives the onValueChange event and
          the track/thumb tint processors from the library's own ViewConfig at runtime. Drag it:
          the value updates live; the colored track proves color derivation. */}
        <View className="section-tight">
          <Text className="switch-label">
            {`volume · ${Math.round(volume * 100)}%`}
          </Text>
          <Slider
            value={volume}
            onValueChange={setVolume}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            minimumTrackTintColor="#7fb5ff"
            maximumTrackTintColor="#334155"
            thumbTintColor="#ffffff"
            // Pin a height so the native track always has room in the flex column.
            className="slider"
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
          onPress={() => setModalVisible(true)}
          color="#7fb5ff"
        />

        {/* Pressable's static look lives in .pressable-card; only the press-state-dependent
          colors stay a style function. */}
        <Pressable
          onPress={() => setCount(value => value + 1)}
          className="pressable-card"
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#13243a' : '#0f1e30',
            borderColor: pressed ? '#7fb5ff' : '#2b6cb0',
          })}
        >
          {({ pressed }) => (
            <Text
              className="pressable-label"
              style={{ color: pressed ? '#7fb5ff' : '#cbd5e1' }}
            >
              {pressed ? 'holding…' : 'press me (also +1)'}
            </Text>
          )}
        </Pressable>

        {/* Horizontal FlatList: real windowing. */}
        <Text className="section-label">FlatList · 24 chips, windowed</Text>
        <FlatList
          testID="chips-list"
          data={chips}
          horizontal
          keyExtractor={item => item.id}
          getItemLayout={(_data, index) => ({
            length: CHIP_WIDTH + CHIP_GAP,
            offset: (CHIP_WIDTH + CHIP_GAP) * index,
            index,
          })}
          className="chip-list"
          renderItem={({ item }) => (
            // width/marginRight stay dynamic — they reference the CHIP_WIDTH/CHIP_GAP
            // script consts (also used by getItemLayout above), which a CSS selector
            // has no way to read; backgroundColor is per-chip (item.color).
            <View
              className="chip-card"
              style={{
                width: CHIP_WIDTH,
                marginRight: CHIP_GAP,
                backgroundColor: item.color,
              }}
            >
              <Text className="chip-number">{item.index}</Text>
            </View>
          )}
        />

        {/* ===== feature-parity device checks ===== */}

        {/* Press-retention measured rect. PASS: press, then drag DOWN ~100px: the panel
          STAYS highlighted (inside the measured rect + 80px bottom retention). Drag UP
          off the top: highlight drops. Proves measured-rect retention rather than a
          symmetric-radius approximation. The dx/dy readout tracks the move offset. */}
        {/* Pressable's static look lives in .retention-card; only the press-state-dependent
          background stays a style function. */}
        <Pressable
          hitSlop={{ top: 0, bottom: 40, left: 0, right: 0 }}
          pressRetentionOffset={{ top: 0, bottom: 80, left: 0, right: 0 }}
          onPressMove={event =>
            setRetentionMove({
              dx: Math.round(nativeNumber(event, 'locationX')),
              dy: Math.round(nativeNumber(event, 'locationY')),
            })
          }
          className="retention-card"
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#2b6cb0' : '#13243a',
          })}
        >
          <Text className="info-text">
            {`drag me · dx ${retentionMove.dx} · dy ${retentionMove.dy}`}
          </Text>
        </Pressable>

        {/* maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows
          you are looking at DO NOT jump; new items appear above without shifting the
          viewport. FAIL: the list jumps to the top. box-list160 is shared with the
          Animated.ScrollView below. */}
        <Text className="section-label">MVCP · prepend without jump</Text>
        <FlatList
          data={mvcpItems}
          keyExtractor={item => item.id}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          className="box-list160"
          renderItem={({ item }) => (
            <View className="mvcp-row">
              <Text className="list-row-text">{item.label}</Text>
            </View>
          )}
        />
        <Button
          title="Prepend 5"
          color="#7fb5ff"
          onPress={() => {
            mvcpHead.current -= 5;
            const head = mvcpHead.current;
            const prepended = Array.from({ length: 5 }, (_value, index) => {
              const n = head + index;
              return { id: `row-${n}`, label: `item ${n}` };
            });
            setMvcpItems(items => [...prepended, ...items]);
          }}
        />

        {/* Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the
          box below (not the page): the bright bar above SMOOTHLY fades to near-invisible
          and lifts, on the UI thread (no jank, no per-frame JS). Proves Animated.ScrollView
          + Animated.event native attach. */}
        <Animated.View
          className="parity-header"
          style={{
            opacity: parityScrollY.interpolate({
              inputRange: [0, 120],
              outputRange: [1, 0.12],
              extrapolate: 'clamp',
            }),
            transform: [
              {
                translateY: parityScrollY.interpolate({
                  inputRange: [0, 120],
                  outputRange: [0, -16],
                  extrapolate: 'clamp',
                }),
              },
            ],
          }}
        >
          <Text className="parity-header-text">
            HEADER — fades as you scroll ↓
          </Text>
        </Animated.View>
        {/* box-list160 is shared with the MVCP FlatList above. */}
        <Animated.ScrollView
          className="box-list160"
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: parityScrollY } } }],
            { useNativeDriver: true },
          )}
        >
          {Array.from({ length: 6 }, (_value, index) => (
            <View key={index} className="scroll-demo-row">
              <Text className="list-row-text">{`scroll me · row ${index}`}</Text>
            </View>
          ))}
        </Animated.ScrollView>
        <Text className="tiny-center">
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
        <Text className="tiny-center">
          tap Freeze, then immediately drag the box — bar should still move
        </Text>

        {/* Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect
          is unmistakable on the dark theme. Kept as inline dynamic style here (not CSS)
          only because these particular demos predate @symbiote-native/css-parser's `raw`
          passthrough for transform/box-shadow/filter/transform-origin (2026-07) — the CSS
          property itself now works identically (see .gradient-card below, which IS
          authored via CSS) — this is just legacy demo wiring, not a remaining gap. */}
        {/* boxShadow: a BLUE glow (a black shadow is invisible on the near-black bg).
          PASS: a soft blue halo bleeds out around the panel. */}
        <View
          className="shadow-card"
          style={{ boxShadow: '0px 0px 22px 3px rgba(127,181,255,0.85)' }}
        >
          <Text className="note-text">boxShadow · blue glow</Text>
        </View>
        {/* filter: same base colour both sides; the right one is darkened by
          brightness(0.5). PASS: the right panel is clearly darker than the left. */}
        <View className="row">
          <View className="filter-tile">
            <Text className="tile-text">no filter</Text>
          </View>
          <View
            className="filter-tile"
            style={{ filter: [{ brightness: 0.5 }] }}
          >
            <Text className="tile-text">brightness 0.5</Text>
          </View>
        </View>
        {/* transformOrigin: the panel rotates around its TOP-LEFT corner, not its centre.
          PASS: the left edge stays put while the bottom-right swings down. */}
        <View
          className="rotated-card"
          style={{
            transformOrigin: 'top left',
            transform: [{ rotate: '4deg' }],
          }}
        >
          <Text className="tile-text">transformOrigin · top-left</Text>
        </View>

        {/* background-image: a CSS `linear-gradient(...)` authored entirely in App.css
          (.gradient-card), proving @symbiote-native/css-parser's `background-image` → RN's
          `experimental_backgroundImage` raw passthrough works end to end (css-parser →
          registerStyles → routeProp → core/engine/src/process-background-image → Fabric).
          PASS: the panel shows a blue-to-orange gradient sweeping left to right. */}
        <View className="gradient-card">
          <Text className="tile-text">background-image · linear-gradient</Text>
        </View>

        {/* Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
          width/height→style); a screen reader reads "React logo" (alt→accessibilityLabel). */}
        <Image
          src="https://reactnative.dev/img/tiny_logo.png"
          alt="React logo"
          width={48}
          height={48}
          className="web-image"
        />

        {/* KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field
          lifts it above the keyboard AND the keyboard is the email layout (proves
          autoComplete/inputMode fold); with enabled OFF the keyboard covers the field. */}
        <View className="switch-row">
          <Text className="switch-label">avoid keyboard</Text>
          <Switch
            value={kavEnabled}
            onValueChange={setKavEnabled}
            trackColor={{ false: '#334155', true: '#2b6cb0' }}
          />
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={kavEnabled}
        >
          <TextInput
            autoComplete="email"
            inputMode="email"
            enterKeyHint="done"
            placeholder="email — focus me near the bottom…"
            placeholderTextColor="#41506a"
            className="text-input"
          />
        </KeyboardAvoidingView>

        <Image
          source={{ uri: 'https://reactnative.dev/img/tiny_logo.png' }}
          className="logo-image"
        />

        <View className="bottom-card">
          <Text className="bottom-text">↑ you scrolled to the bottom</Text>
        </View>

        {/* Modal overlays its own window */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          {/* transparent modal => paint our own dim layer (the RN pattern) */}
          <View className="modal-overlay">
            <View testID="modal-card" className="modal-card">
              <Text className="modal-title">It's a Modal</Text>
              <Text className="modal-body">
                Rendered through ModalHostView — its own native window, same
                Fabric tree.
              </Text>
              <Button
                testID="modal-close"
                title="Close"
                onPress={() => setModalVisible(false)}
                color="#7fb5ff"
              />
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

export default App;
