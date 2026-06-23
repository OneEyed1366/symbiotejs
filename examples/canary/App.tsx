/**
 * Symbiote canary app. Every primitive here — View, Text, ScrollView, TextInput,
 * Image, Switch, ActivityIndicator, Button, Pressable, Modal, FlatList,
 * RefreshControl — comes from @symbiote/react, not react-native. The tree is
 * rendered by our own react-reconciler host config straight onto Fabric; React
 * Native's renderer is never involved. Run with DEBUG=1 to watch each interaction
 * commit incrementally (created=0, only the touched branch clones) in Metro's logs.
 *
 * @format
 */

import { useCallback, useEffect, useRef, useState } from 'react'
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
  PanResponder,
  I18nManager,
  Settings,
  PlatformColor,
  DynamicColorIOS,
  findNodeHandle,
  type HostInstance,
} from '@symbiote/react'
// A real third-party native view, used straight from the library — no symbiote
// wrapper. symbiote derives RNCSlider's events and prop processors from its own
// ViewConfig at runtime; this is the "install the package, use its component" path.
import Slider from '@react-native-community/slider'

const CHIP_WIDTH = 72
const CHIP_GAP = 12
const REFRESH_MS = 2000

const chips = Array.from({ length: 24 }, (_, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}))

const SLIDE_DISTANCE = 220

// Animated, both drivers side by side. The pulse runs on the NATIVE driver — the
// curve lives in NativeAnimated, so zero JS runs per frame (DEBUG shows a single
// `native: startAnimatingNode`, no per-frame commits). The two slide dots run the
// SAME timing on different drivers: the JS one commits a clone every frame (DEBUG
// logs `commit … incremental` ~60×/run), the native one offloads it. Each dot keeps
// its own Animated.Value so a JS run and a native run never touch the same node.
function AnimatedDemo() {
  const pulse = useRef(new Animated.Value(0)).current
  const jsSlide = useRef(new Animated.Value(0)).current
  const nativeSlide = useRef(new Animated.Value(0)).current
  const [jsForward, setJsForward] = useState(false)
  const [nativeForward, setNativeForward] = useState(false)

  // A perpetual native-driven heartbeat. A SINGLE looping timing offloads entirely
  // to native (iterations -1, zero JS per cycle); the 0->1 ramp becomes a breathe
  // in-and-out via the [0, 0.5, 1] interpolation, so no JS sequence is needed.
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
    )
    animation.start()
    return () => animation.stop()
  }, [pulse])

  const pulseScale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.3, 1] })
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] })

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
    }).start()
    setForward(!forward)
  }

  const jsX = jsSlide.interpolate({ inputRange: [0, 1], outputRange: [0, SLIDE_DISTANCE] })
  const nativeX = nativeSlide.interpolate({ inputRange: [0, 1], outputRange: [0, SLIDE_DISTANCE] })

  // Proof of offload (ADR 0017): kick both slides, then jam the JS thread for 1.5s.
  // The native-driven pulse + green slide keep moving on the UI side through the
  // freeze; the JS-driven orange slide stalls until the thread is released. If the
  // "native" path had silently fallen back to JS, the pulse would freeze too.
  const freezeJs = (): void => {
    slide(jsSlide, jsForward, setJsForward, false)
    slide(nativeSlide, nativeForward, setNativeForward, true)
    const until = Date.now() + 1500
    while (Date.now() < until) {
      // Intentionally block the JS thread — no requestAnimationFrame can fire here.
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: '#41506a', fontSize: 13 }}>Animated · JS vs native driver</Text>

      {/* native-driven perpetual pulse */}
      <View style={{ height: 64, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: '#7fb5ff',
            opacity: pulseOpacity,
            transform: [{ scale: pulseScale }],
          }}
        />
      </View>

      {/* JS-driven slide: a commit per frame */}
      <View style={{ height: 36, justifyContent: 'center' }}>
        <Animated.View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: '#f6ad55',
            transform: [{ translateX: jsX }],
          }}
        />
      </View>
      <Button
        title="Slide (JS driver)"
        onPress={() => slide(jsSlide, jsForward, setJsForward, false)}
        color="#f6ad55"
      />

      {/* native-driven slide: offloaded, zero JS frames */}
      <View style={{ height: 36, justifyContent: 'center' }}>
        <Animated.View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: '#68d391',
            transform: [{ translateX: nativeX }],
          }}
        />
      </View>
      <Button
        title="Slide (native driver)"
        onPress={() => slide(nativeSlide, nativeForward, setNativeForward, true)}
        color="#68d391"
      />

      {/* Freeze the JS thread 1.5s: native (pulse + green) keep moving, JS (orange) stalls */}
      <Button title="Freeze JS 1.5s" onPress={freezeJs} color="#fc8181" />
    </View>
  )
}

// The rest of the Animated surface: ValueXY (2D), tracking (chase a moving target),
// and diffClamp (a collapsing header). Each is a thin port of the RN node.
const XY_SPAN = 96
const TRACK_DISTANCE = 200
const HEADER_COLLAPSE = 60

function AnimatedParityDemo() {
  // --- ValueXY + PanResponder: drag the box, clamped inside the frame --------
  // Track the resting position in a ref; each move sets the absolute position
  // (resting + gesture delta) clamped to [0, DRAG_MAX] so the box can't leave the
  // frame. DRAG_MAX = inner width (XY_SPAN+36 - 6*2 padding) - box (36).
  const DRAG_MAX = XY_SPAN - 12
  const xy = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current
  const restingPos = useRef({ x: 0, y: 0 })
  const clamp = (n: number): number => Math.max(0, Math.min(DRAG_MAX, n))
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_event, gesture) => {
        xy.setValue({
          x: clamp(restingPos.current.x + gesture.dx),
          y: clamp(restingPos.current.y + gesture.dy),
        })
      },
      onPanResponderRelease: (_event, gesture) => {
        restingPos.current = {
          x: clamp(restingPos.current.x + gesture.dx),
          y: clamp(restingPos.current.y + gesture.dy),
        }
      },
    }),
  ).current

  // --- Tracking: a follower spring-chases a lead value that animates on tap ---
  const lead = useRef(new Animated.Value(0)).current
  const follow = useRef(new Animated.Value(0)).current
  const [leadForward, setLeadForward] = useState(false)
  useEffect(() => {
    // Set up once: follow tracks lead. Every lead change re-aims the spring, so the
    // follower lags and chases rather than jumping — the tracking signature.
    Animated.spring(follow, { toValue: lead, useNativeDriver: false }).start()
    return () => follow.stopAnimation()
  }, [follow, lead])
  const moveLead = (): void => {
    Animated.timing(lead, {
      toValue: leadForward ? 0 : TRACK_DISTANCE,
      duration: 700,
      useNativeDriver: false,
    }).start()
    setLeadForward(!leadForward)
  }

  // --- diffClamp: a header that collapses as you scroll down, reveals on up ---
  const scroll = useRef(new Animated.Value(0)).current
  const scrollPos = useRef(0)
  const headerOffset = useRef(
    Animated.diffClamp(scroll, 0, HEADER_COLLAPSE).interpolate({
      inputRange: [0, HEADER_COLLAPSE],
      outputRange: [0, -HEADER_COLLAPSE],
    }),
  ).current
  const scrollBy = (delta: number): void => {
    scrollPos.current = Math.max(0, scrollPos.current + delta)
    Animated.timing(scroll, { toValue: scrollPos.current, duration: 180, useNativeDriver: false }).start()
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: '#41506a', fontSize: 13 }}>Animated · ValueXY / tracking / diffClamp</Text>

      {/* ValueXY box you drag with a finger (PanResponder) */}
      <Text style={{ color: '#718096', fontSize: 11 }}>drag the purple box →</Text>
      <View
        style={{
          width: XY_SPAN + 36,
          height: XY_SPAN + 36,
          borderRadius: 12,
          backgroundColor: '#eef2f9',
          padding: 6,
        }}
      >
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: '#9f7aea',
            transform: xy.getTranslateTransform(),
          }}
        />
      </View>

      {/* Tracking: lead dot (blue) and follower (orange) that lags behind it */}
      <View style={{ height: 30, justifyContent: 'center' }}>
        <Animated.View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#4299e1',
            transform: [{ translateX: lead }],
          }}
        />
      </View>
      <View style={{ height: 30, justifyContent: 'center' }}>
        <Animated.View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#f6ad55',
            transform: [{ translateX: follow }],
          }}
        />
      </View>
      <Button title="Move target (follower chases)" onPress={moveLead} color="#4299e1" />

      {/* diffClamp collapsing header */}
      <View style={{ height: HEADER_COLLAPSE + 24, overflow: 'hidden', justifyContent: 'flex-start' }}>
        <Animated.View
          style={{
            height: HEADER_COLLAPSE,
            borderRadius: 8,
            backgroundColor: '#38b2ac',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ translateY: headerOffset }],
          }}
        >
          <Text style={{ color: 'white', fontSize: 12 }}>collapsing header</Text>
        </Animated.View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="Scroll ↓" onPress={() => scrollBy(40)} color="#38b2ac" />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Scroll ↑" onPress={() => scrollBy(-40)} color="#38b2ac" />
        </View>
      </View>
    </View>
  )
}

// The three runtime modules added this pass, each read live so it only resolves on a
// real host: I18nManager (RTL layout constants), Settings (a value round-tripped
// through iOS NSUserDefaults via SettingsManager), and Image's static methods
// (getSize / queryCache / prefetch, which hit the ImageLoader native module).
const LOGO_URI = 'https://reactnative.dev/img/tiny_logo.png'
// A distinct cache key for the prefetch demo: same asset, different URL (query
// string), so nothing has loaded it yet. The cache starts cold and the button
// visibly warms it — unlike LOGO_URI, which getSize + the <Image> already pulled in.
const PREFETCH_URI = 'https://reactnative.dev/img/tiny_logo.png?warm=symbiote'
const TAP_KEY = 'symbiote.tapCount'

function NativeModulesDemo() {
  // I18nManager — RTL constants, read once at render. A non-throwing read proves the
  // module name resolved; the values flip if you force RTL and relaunch.
  const rtl = I18nManager.getConstants()

  // Settings — a counter persisted to NSUserDefaults: read back on mount, bumped and
  // re-saved on tap, and watched so an external write to the key reflects live. It
  // survives a relaunch, which is the whole point of the module.
  const [persisted, setPersisted] = useState(() => {
    const stored = Settings.get(TAP_KEY)
    return typeof stored === 'number' ? stored : 0
  })
  useEffect(() => {
    const watchId = Settings.watchKeys(TAP_KEY, () => {
      const stored = Settings.get(TAP_KEY)
      if (typeof stored === 'number') setPersisted(stored)
    })
    return () => Settings.clearWatch(watchId)
  }, [])
  const persistTap = (): void => {
    const next = persisted + 1
    Settings.set({ [TAP_KEY]: next })
    setPersisted(next)
  }

  // Image statics — getSize resolves the rendered logo's real pixel dimensions
  // through ImageLoader (the <Image> below paints that same asset).
  const [imageSize, setImageSize] = useState('measuring…')
  useEffect(() => {
    Image.getSize(LOGO_URI)
      .then(({ width, height }) => setImageSize(`${width}×${height}px`))
      .catch(() => setImageSize('unavailable'))
  }, [])

  // Prefetch on a COLD url nothing has loaded: queryCache shows it absent, the
  // button warms it, and a re-query flips the readout — the visible effect.
  const [cacheState, setCacheState] = useState('checking…')
  const refreshCache = useCallback((): void => {
    Image.queryCache([PREFETCH_URI])
      .then(cache => setCacheState(cache[PREFETCH_URI] ?? 'not cached'))
      .catch(() => setCacheState('unavailable'))
  }, [])
  useEffect(() => refreshCache(), [refreshCache])
  const prefetchLogo = (): void => {
    setCacheState('prefetching…')
    void Image.prefetch(PREFETCH_URI)
      .then(() => refreshCache())
      .catch(() => setCacheState('unavailable'))
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: '#41506a', fontSize: 13 }}>
        Runtime modules · I18nManager / Settings / Image statics
      </Text>

      {/* I18nManager — RTL layout constants, read live */}
      <Text style={{ color: '#cbd5e1', fontSize: 14 }}>
        {`RTL: ${rtl.isRTL ? 'on' : 'off'} · swap L/R: ${rtl.doLeftAndRightSwapInRTL ? 'yes' : 'no'}`}
      </Text>
      <Button
        title={rtl.isRTL ? 'Force LTR (needs reload)' : 'Force RTL (needs reload)'}
        onPress={() => I18nManager.forceRTL(!rtl.isRTL)}
        color="#7fb5ff"
      />

      {/* Settings — counter persisted to NSUserDefaults, survives a relaunch */}
      <Text style={{ color: '#cbd5e1', fontSize: 14 }}>
        {`persisted taps: ${persisted} · survives relaunch`}
      </Text>
      <Button title="Persist a tap" onPress={persistTap} color="#7fb5ff" />

      {/* Image statics — the rendered asset + getSize's measurement of it */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Image
          source={{ uri: LOGO_URI }}
          style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: '#0f1e30' }}
        />
        <Text style={{ color: '#cbd5e1', fontSize: 14, flex: 1 }}>
          {`logo size: ${imageSize}`}
        </Text>
      </View>
      {/* prefetch warms a cold url: not cached → (tap) → cached */}
      <Text style={{ color: '#cbd5e1', fontSize: 14 }}>{`prefetch cache: ${cacheState}`}</Text>
      <Button title="Prefetch logo" onPress={prefetchLogo} color="#7fb5ff" />
    </View>
  )
}

// Imperative host-ref API — the seam reanimated / gesture-handler reach through.
// `measure` returns the box's real on-screen frame (only a live host can answer it);
// `setNativeProps` recolors the box bypassing React entirely (no state, no re-render);
// `findNodeHandle` reads the committed native tag. The flash holds until the next React
// commit re-applies the declarative style — exactly RN's imperative-override semantics.
function RefApiDemo() {
  const boxRef = useRef<HostInstance | null>(null)
  const flashedRef = useRef(false)
  const [frame, setFrame] = useState('tap “Measure”')
  const [tag, setTag] = useState<number | null>(null)

  useEffect(() => {
    // The tag exists only after the first commit, so read it post-mount.
    setTag(findNodeHandle(boxRef.current))
  }, [])

  const onMeasure = (): void => {
    const box = boxRef.current
    if (box === null) return
    box.measure((x, y, width, height, pageX, pageY) => {
      setFrame(
        `x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
          ` · page ${Math.round(pageX)},${Math.round(pageY)}`,
      )
    })
  }

  const onFlash = (): void => {
    const box = boxRef.current
    if (box === null) return
    flashedRef.current = !flashedRef.current
    box.setNativeProps({ style: { backgroundColor: flashedRef.current ? '#f6ad55' : '#7fb5ff' } })
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: '#41506a', fontSize: 13 }}>
        Imperative ref · measure / setNativeProps / findNodeHandle
      </Text>
      <View
        ref={boxRef}
        style={{
          height: 56,
          borderRadius: 12,
          backgroundColor: '#7fb5ff',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ color: '#0b1622', fontSize: 14, fontWeight: 'bold' }}>
          {`native tag ${tag ?? '—'}`}
        </Text>
      </View>
      <Text style={{ color: '#cbd5e1', fontSize: 14 }}>{`frame: ${frame}`}</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Measure" onPress={onMeasure} color="#7fb5ff" />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Flash (setNativeProps)" onPress={onFlash} color="#f6ad55" />
        </View>
      </View>
    </View>
  )
}

// PlatformColor / DynamicColorIOS resolve on the native side: 'systemBlue' / 'label'
// become iOS UIColor selectors, and the dynamic tuple flips with the system
// appearance. The opaque color objects flow through the same color seam as CSS
// strings (processColor), so no special handling reaches Fabric. Name resolution is
// device-only — a wrong name silently falls back, so this is verified on simulator.
function PlatformColorDemo() {
  const scheme = useColorScheme()
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: '#41506a', fontSize: 13 }}>
        {`PlatformColor · semantic + DynamicColorIOS (${scheme ?? 'unknown'})`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View
          style={{
            flex: 1,
            height: 56,
            borderRadius: 12,
            backgroundColor: PlatformColor('systemBlue'),
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: 'bold' }}>systemBlue</Text>
        </View>
        <View
          style={{
            flex: 1,
            height: 56,
            borderRadius: 12,
            backgroundColor: DynamicColorIOS({ light: '#dbeafe', dark: '#13243a' }),
            borderWidth: 1,
            borderColor: PlatformColor('separator'),
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ color: PlatformColor('label'), fontSize: 13, fontWeight: 'bold' }}>
            dynamic
          </Text>
        </View>
      </View>
    </View>
  )
}

function App() {
  const [count, setCount] = useState(0)
  const [name, setName] = useState('')
  const [spinning, setSpinning] = useState(true)
  const [volume, setVolume] = useState(0.5)
  const [modalVisible, setModalVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshes, setRefreshes] = useState(0)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [statusBarHidden, setStatusBarHidden] = useState(false)
  const [darkStatusBar, setDarkStatusBar] = useState(false)

  // Tier B runtime modules, read live: the hooks pull from Dimensions/Appearance,
  // appState tracks foreground/background through AppState's device events.
  const window = useWindowDimensions()
  const colorScheme = useColorScheme()
  const [appState, setAppState] = useState<string>(AppState.currentState ?? 'unknown')

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
          : 0
      setKeyboardHeight(height)
    }
    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () => setKeyboardHeight(0)),
    ]
    return () => subscriptions.forEach(subscription => subscription.remove())
  }, [])

  // native -> JS: AppState pushes lifecycle changes; read the current phase live.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (...args: unknown[]) => {
      const next = args[0]
      if (typeof next === 'string') setAppState(next)
    })
    return () => subscription.remove()
  }, [])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => {
      setRefreshing(false)
      setRefreshes(value => value + 1)
    }, REFRESH_MS)
  }, [])

  // JS -> native imperative modules. A Promise reject (no native module / user
  // cancel) is expected, so it's swallowed — this is a demo, not a flow to handle.
  const onShare = useCallback(() => {
    void Share.share({ message: 'Sent from symbiote', url: 'https://reactnative.dev' }).catch(
      () => {},
    )
  }, [])
  const onAlert = useCallback(() => {
    Alert.alert('symbiote', 'Native AlertManager reached.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Vibrate', onPress: () => Vibration.vibrate() },
    ])
  }, [])
  const onActionSheet = useCallback(() => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Share', 'Vibrate', 'Cancel'], cancelButtonIndex: 2 },
      (index: number) => {
        if (index === 0) onShare()
        if (index === 1) Vibration.vibrate()
      },
    )
  }, [onShare])
  const onOpenUrl = useCallback(() => {
    void Linking.openURL('https://reactnative.dev').catch(() => {})
  }, [])

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0b1622' }}
      contentContainerStyle={{
        paddingVertical: 64,
        paddingHorizontal: 24,
        alignItems: 'stretch',
        gap: 28,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7fb5ff" />
      }>
      {/* JS->native: StatusBar renders nothing — it drives the iOS status bar
          (the top strip: clock, wi-fi, battery) imperatively from these props. */}
      <StatusBar
        barStyle={darkStatusBar ? 'dark-content' : 'light-content'}
        hidden={statusBarHidden}
        animated
      />
      <Text style={{ color: '#7fb5ff', fontSize: 16, textAlign: 'center' }}>
        symbiote · all primitives
      </Text>
      {/* native->JS: keyboard height pushed from the device hub, read live */}
      <Text style={{ color: '#7fb5ff', fontSize: 13, textAlign: 'center' }}>
        {keyboardHeight > 0 ? `keyboard up · ${keyboardHeight}px` : 'keyboard down'}
      </Text>
      {/* Tier A runtime modules, read live from the real native side. A non-empty
          Version proves PlatformConstants resolved; a fractional hairline (e.g. 0.333
          on @3x) proves DeviceInfo's scale resolved. The border below IS that hairline. */}
      <Text
        style={{
          color: '#7fb5ff',
          fontSize: 13,
          textAlign: 'center',
          paddingTop: 8,
          borderTopColor: '#2b6cb0',
          borderTopWidth: StyleSheet.hairlineWidth,
        }}>
        {`${Platform.OS} ${Platform.Version}` +
          `${Platform.isPad ? ' · iPad' : ''}` +
          ` · ${Platform.select({ ios: 'native ios', android: 'native android', default: '?' })}` +
          ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`}
      </Text>
      {/* Tier B runtime modules, live. Real w×h@scale proves Dimensions + PixelRatio;
          a colorScheme proves Appearance; appState flips when you background the app
          (AppState's device events). */}
      <Text style={{ color: '#7fb5ff', fontSize: 13, textAlign: 'center' }}>
        {`${Math.round(window.width)}×${Math.round(window.height)} @${PixelRatio.get()}x` +
          ` · ${colorScheme ?? 'no-scheme'} · ${appState}`}
      </Text>
      {/* JS->native StatusBar controls — watch the top strip react */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button
            title={statusBarHidden ? 'Show status bar' : 'Hide status bar'}
            onPress={() => setStatusBarHidden(value => !value)}
            color="#7fb5ff"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={darkStatusBar ? 'Light text' : 'Dark text'}
            onPress={() => setDarkStatusBar(value => !value)}
            color="#7fb5ff"
          />
        </View>
      </View>
      {/* JS->native imperative modules — tap to fire the real native UI / haptics.
          Each working button proves its module name resolved on the bridgeless host. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Alert" onPress={onAlert} color="#7fb5ff" />
        </View>
        {/* ActionSheetIOS drives the iOS-only ActionSheetManager — no Android native
            module exists, so the control is iOS-only by design (not a gap). */}
        {Platform.OS !== 'android' && (
          <View style={{ flex: 1 }}>
            <Button title="Action sheet" onPress={onActionSheet} color="#7fb5ff" />
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Share" onPress={onShare} color="#7fb5ff" />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Vibrate" onPress={() => Vibration.vibrate()} color="#7fb5ff" />
        </View>
      </View>
      <Button title="Open reactnative.dev" onPress={onOpenUrl} color="#7fb5ff" />

      {/* The native UIRefreshControl spinner only shows while iOS holds the scroll
          view pulled-down; our full re-commit snaps the offset back, so we drive
          our OWN indicator from the same `refreshing` flag — guaranteed visible. */}
      {refreshing ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
          <ActivityIndicator color="#7fb5ff" />
          <Text style={{ color: '#7fb5ff', fontSize: 13 }}>Refreshing…</Text>
        </View>
      ) : (
        <Text style={{ color: '#41506a', fontSize: 13, textAlign: 'center' }}>
          {`pull to refresh · refreshed ${refreshes}×`}
        </Text>
      )}

      {/* View + press-to-increment */}
      <View
        onPress={() => setCount(value => value + 1)}
        style={{
          paddingVertical: 18,
          borderRadius: 16,
          backgroundColor: '#2b6cb0',
          alignItems: 'center',
        }}>
        <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: 'bold' }}>
          {`tapped ${count}×`}
        </Text>
      </View>

      {/* TextInput + greeting */}
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="type your name…"
        placeholderTextColor="#41506a"
        style={{
          height: 44,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#2b6cb0',
          paddingHorizontal: 14,
          color: '#ffffff',
          fontSize: 18,
          backgroundColor: '#0f1e30',
        }}
      />
      <Text style={{ color: '#ffffff', fontSize: 20, textAlign: 'center' }}>
        {name ? `Hello, ${name}` : 'Hello, stranger'}
      </Text>

      {/* Switch drives the ActivityIndicator */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
        }}>
        <Text style={{ color: '#cbd5e1', fontSize: 16 }}>spinner</Text>
        <Switch
          value={spinning}
          onValueChange={setSpinning}
          trackColor={{ false: '#334155', true: '#2b6cb0' }}
        />
      </View>
      <ActivityIndicator animating={spinning} color="#7fb5ff" size="large" />

      {/* Slider — a THIRD-PARTY native view (@react-native-community/slider). symbiote
          ships zero metadata for it: shared derives its onValueChange event and the
          track/thumb tint processors from the library's own ViewConfig at runtime.
          Drag it — the value updates live; the colored track proves color derivation. */}
      <View style={{ gap: 8 }}>
        <Text style={{ color: '#cbd5e1', fontSize: 16 }}>
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
          style={{ height: 40, alignSelf: 'stretch' }}
        />
      </View>

      {/* Animated — JS driver vs native driver, side by side */}
      <AnimatedDemo />

      {/* Animated — ValueXY, tracking, diffClamp */}
      <AnimatedParityDemo />

      {/* Runtime modules — I18nManager, Settings, Image statics */}
      <NativeModulesDemo />

      {/* Imperative host-ref API — measure / setNativeProps / findNodeHandle */}
      <RefApiDemo />

      {/* PlatformColor / DynamicColorIOS — native semantic + appearance-aware colors */}
      <PlatformColorDemo />

      {/* Button opens a Modal */}
      <Button title="Open modal" onPress={() => setModalVisible(true)} color="#7fb5ff" />

      {/* Pressable card with pressed-state feedback */}
      <Pressable
        onPress={() => setCount(value => value + 1)}
        style={({ pressed }) => ({
          paddingVertical: 16,
          borderRadius: 14,
          alignItems: 'center',
          backgroundColor: pressed ? '#13243a' : '#0f1e30',
          borderWidth: 1,
          borderColor: pressed ? '#7fb5ff' : '#2b6cb0',
        })}>
        {({ pressed }) => (
          <Text style={{ color: pressed ? '#7fb5ff' : '#cbd5e1', fontSize: 15 }}>
            {pressed ? 'holding…' : 'press me (also +1)'}
          </Text>
        )}
      </Pressable>

      {/* Horizontal FlatList — real windowing */}
      <Text style={{ color: '#41506a', fontSize: 13 }}>FlatList · 24 chips, windowed</Text>
      <FlatList
        data={chips}
        horizontal
        keyExtractor={item => item.id}
        getItemLayout={(_data, index) => ({
          length: CHIP_WIDTH + CHIP_GAP,
          offset: (CHIP_WIDTH + CHIP_GAP) * index,
          index,
        })}
        style={{ height: 84 }}
        renderItem={({ item }) => (
          <View
            style={{
              width: CHIP_WIDTH,
              height: 72,
              marginRight: CHIP_GAP,
              borderRadius: 12,
              backgroundColor: item.color,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ color: '#0b1622', fontSize: 18, fontWeight: 'bold' }}>
              {item.index}
            </Text>
          </View>
        )}
      />

      <Image
        source={{ uri: 'https://reactnative.dev/img/tiny_logo.png' }}
        style={{ width: 64, height: 64, borderRadius: 12, alignSelf: 'center' }}
      />

      <View
        style={{
          height: 200,
          borderRadius: 16,
          backgroundColor: '#13243a',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ color: '#7fb5ff', fontSize: 16 }}>↑ you scrolled to the bottom</Text>
      </View>

      {/* Modal overlays its own window */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}>
        {/* transparent modal => paint our own dim layer (the RN pattern) */}
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)',
          }}>
          <View
            style={{
              width: 280,
              padding: 24,
              borderRadius: 20,
              backgroundColor: '#0f1e30',
              alignItems: 'center',
              gap: 16,
            }}>
            <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: 'bold' }}>
              It's a Modal
            </Text>
            <Text style={{ color: '#cbd5e1', fontSize: 14, textAlign: 'center' }}>
              Rendered through ModalHostView — its own native window, same Fabric tree.
            </Text>
            <Button title="Close" onPress={() => setModalVisible(false)} color="#7fb5ff" />
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

export default App
