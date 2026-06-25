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
  type HostInstance,
  type SymbioteEvent,
  type FlatListHandle,
  type Section,
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

// Responder — the gesture capabilities the rewrite unlocked, shown so the grabbed
// element is the one that moves. Each chip is its OWN responder: it grabs on touch
// start and drags ITSELF (onResponderMove translates that chip). Drag a chip past a
// threshold and the surrounding strip STEALS the gesture — its onMoveShouldSetResponder
// fires once the finger has travelled far enough, the chip yields (onResponder-
// TerminationRequest -> terminate, so it snaps back) and the strip pans the whole row.
// A small drag moves the digit; a big drag hands off to the strip — move-should-set and
// transfer, each visible (and the separate "transfer" line lights on the hand-off).
// DEBUG logcat shows "responder transferred ... -> ..." at that moment.
const RESPONDER_CHIPS = [0, 1, 2, 3, 4]
// Horizontal travel (in the touch's page units — px on Android, pt on iOS, so the feel
// differs a little per platform) after which the strip steals the gesture from the chip.
const RESPONDER_STEAL_DX = 64

function firstTouchX(event: SymbioteEvent): number {
  const touches = event.nativeEvent.touches
  if (!Array.isArray(touches) || touches.length === 0) return 0
  const first: unknown = touches[0]
  if (typeof first === 'object' && first !== null && 'pageX' in first) {
    const pageX = first.pageX
    return typeof pageX === 'number' ? pageX : 0
  }
  return 0
}

function ResponderDemo() {
  const [activeChip, setActiveChip] = useState<number | null>(null)
  const [chipDx, setChipDx] = useState(0)
  const [rowDx, setRowDx] = useState(0)
  const [status, setStatus] = useState('tap a chip · drag it to move · drag far → strip steals it')
  const [transfer, setTransfer] = useState('')
  const startX = useRef(0)
  const panStartX = useRef(0)
  const grabbed = useRef<number | null>(null)

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: '#41506a', fontSize: 13 }}>
        Responder · drag a chip vs hand-off to the strip
      </Text>
      <Text style={{ color: '#cbd5e1', fontSize: 14 }}>{status}</Text>
      {/* the separate transfer indicator — lit only when the strip steals the gesture */}
      <Text style={{ color: transfer ? '#f6ad55' : '#41506a', fontSize: 13 }}>
        {transfer || 'transfer: —'}
      </Text>
      <View
        // Claims the gesture only once the finger has travelled past the threshold,
        // stealing it from whichever chip currently holds it — the transfer path.
        onMoveShouldSetResponder={(event) =>
          grabbed.current !== null &&
          Math.abs(firstTouchX(event) - startX.current) > RESPONDER_STEAL_DX
        }
        onResponderGrant={(event) => {
          setTransfer(`↯ strip stole the gesture from chip ${grabbed.current ?? '?'}`)
          setActiveChip(null)
          setChipDx(0)
          panStartX.current = firstTouchX(event)
          setStatus('strip panning')
        }}
        onResponderMove={(event) => setRowDx(firstTouchX(event) - panStartX.current)}
        onResponderRelease={() => { setRowDx(0); setStatus('strip released') }}
        onResponderTerminate={() => setRowDx(0)}
        style={{ padding: 12, borderRadius: 12, backgroundColor: '#13243a' }}>
        <View style={{ flexDirection: 'row', gap: 8, transform: [{ translateX: rowDx }] }}>
          {RESPONDER_CHIPS.map((index) => (
            <View
              key={index}
              testID={`resp-chip-${index}`}
              // Grabs on start and drags itself; yields to the strip past the threshold.
              onStartShouldSetResponder={() => true}
              onResponderGrant={(event) => {
                startX.current = firstTouchX(event)
                grabbed.current = index
                setActiveChip(index)
                setChipDx(0)
                setRowDx(0)
                setTransfer('')
                setStatus(`chip ${index} grabbed`)
              }}
              onResponderMove={(event) => {
                const dx = firstTouchX(event) - startX.current
                setChipDx(dx)
                setStatus(`chip ${index} moving · dx=${Math.round(dx)}`)
              }}
              onResponderTerminationRequest={() => true}
              onResponderTerminate={() => { setChipDx(0); setActiveChip(null) }}
              onResponderRelease={() => { setChipDx(0); setActiveChip(null); setStatus(`chip ${index} released`) }}
              style={{
                width: 56,
                height: 48,
                borderRadius: 8,
                backgroundColor: '#2b6cb0',
                borderWidth: 2,
                borderColor: activeChip === index ? '#7fb5ff' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ translateX: activeChip === index ? chipDx : 0 }],
              }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold' }}>{index}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

// Accessibility — the props reach native unchanged (accessibilityLabel -> Android
// content-desc / iOS accessibilityLabel; accessibilityState -> checked/selected/enabled),
// the web aria-*/role aliases FOLD to accessibility* in our wrapper (raw aria-* must
// never reach native), and AccessibilityInfo reads device state + drives announce.
// Verify on Android with `uiautomator dump` (content-desc / selected / enabled) and
// logcat for the announce + module-resolution dlogs; on iOS via Accessibility Inspector.
function AccessibilityDemo() {
  const [screenReader, setScreenReader] = useState('querying…')

  useEffect(() => {
    // A non-throwing getter proves the native module name resolved (Android
    // 'AccessibilityInfo' / iOS 'AccessibilityManager'); a reject means wrong name.
    AccessibilityInfo.isScreenReaderEnabled()
      .then(enabled => setScreenReader(enabled ? 'on' : 'off'))
      .catch(() => setScreenReader('unavailable'))
    AccessibilityInfo.announceForAccessibility('symbiote accessibility online')
  }, [])

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: '#41506a', fontSize: 13 }}>
        Accessibility · props → native · aria/role transform · AccessibilityInfo
      </Text>
      {/* getter readout — 'off' (no screen reader) proves the module resolved */}
      <Text style={{ color: '#cbd5e1', fontSize: 14 }}>{`screen reader: ${screenReader}`}</Text>
      {/* canonical accessibility* — content-desc 'a11y-canonical-label' + role=header */}
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel="a11y-canonical-label"
        style={{ padding: 12, borderRadius: 10, backgroundColor: '#13243a' }}>
        <Text style={{ color: '#cbd5e1', fontSize: 14 }}>canonical label + role=header</Text>
      </View>
      {/* web aria and role aliases — MUST fold: content-desc should be
          'a11y-aria-label', a raw aria-label attribute must not reach the native node */}
      <View
        accessible
        role="button"
        aria-label="a11y-aria-label"
        style={{ padding: 12, borderRadius: 10, backgroundColor: '#13243a' }}>
        <Text style={{ color: '#cbd5e1', fontSize: 14 }}>aria-label + role=button</Text>
      </View>
      {/* accessibilityState — uiautomator shows enabled=false / selected=true */}
      <View
        accessible
        accessibilityLabel="a11y-state"
        accessibilityState={{ disabled: true, selected: true }}
        style={{ padding: 12, borderRadius: 10, backgroundColor: '#13243a' }}>
        <Text style={{ color: '#cbd5e1', fontSize: 14 }}>state: disabled + selected</Text>
      </View>
    </View>
  )
}

// Verification panel for the freshly-wired feature-parity tails — five behaviors with
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
const paritySections: Section<{ id: string; label: string }>[] = [
  { title: 'Fruit', data: sectionData('f', 'apple') },
  { title: 'Tools', data: sectionData('t', 'hammer') },
  { title: 'Cities', data: sectionData('c', 'porto') },
]

function ParityDemo() {
  const listRef = useRef<FlatListHandle>(null)
  const titleRef = useRef<HostInstance>(null)
  const [longPressMsg, setLongPressMsg] = useState('long-press or tap the row below')
  const [dismissMsg, setDismissMsg] = useState('focus the field, then Hide keyboard')

  return (
    <View style={{ gap: 12 }}>
      <Text ref={titleRef} style={{ color: '#41506a', fontSize: 13 }}>
        Parity checks · longPress · dismiss · animated scroll · sticky · a11y focus
      </Text>

      {/* #10 Text.onLongPress synthesis — hold ~0.5s (suppresses tap) vs quick tap */}
      <Text
        onLongPress={() => setLongPressMsg('long press! (tap was suppressed)')}
        onPress={() => setLongPressMsg('tap')}
        style={{ color: '#cbd5e1', fontSize: 15, padding: 12, borderRadius: 10, backgroundColor: '#13243a' }}>
        {longPressMsg}
      </Text>

      {/* #15 Keyboard.dismiss — blurs whatever input holds focus, no ref needed */}
      <TextInput
        placeholder="focus me…"
        placeholderTextColor="#41506a"
        onFocus={() => setDismissMsg('keyboard up — tap Hide keyboard')}
        onBlur={() => setDismissMsg('blurred (keyboard down)')}
        style={{ color: '#e2e8f0', padding: 12, borderRadius: 10, backgroundColor: '#0f1e30', borderWidth: 1, borderColor: '#2b6cb0' }}
      />
      <Text style={{ color: '#cbd5e1', fontSize: 13 }}>{dismissMsg}</Text>
      <Button title="Hide keyboard" onPress={() => Keyboard.dismiss()} color="#7fb5ff" />

      {/* #12 animated VirtualizedList scroll — smooth (native command) vs instant.
          A fixed height with no wrapper: the vertical ScrollView now clips to its own
          frame (overflow:'scroll' base, like RN), so rows stay inside the box on iOS too. */}
      <Text style={{ color: '#41506a', fontSize: 13 }}>FlatList · animated scrollToOffset</Text>
      <FlatList
        ref={listRef}
        data={parityRows}
        keyExtractor={item => item.id}
        getItemLayout={(_data, index) => ({ length: PARITY_ROW_H, offset: PARITY_ROW_H * index, index })}
        style={{ height: 120, borderRadius: 10, backgroundColor: '#0f1e30' }}
        renderItem={({ item }) => (
          <View style={{ height: PARITY_ROW_H, justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text style={{ color: '#cbd5e1', fontSize: 14 }}>{`row ${item.n}`}</Text>
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Scroll ▼ animated" onPress={() => listRef.current?.scrollToOffset({ offset: 20 * PARITY_ROW_H, animated: true })} color="#7fb5ff" />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Top · instant" onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: false })} color="#7fb5ff" />
        </View>
      </View>

      {/* #13 sticky section headers — drag the inner list: each header pins at the top.
          Cross-talk check: as the NEXT header reaches the top it should PUSH the pinned
          one off (nextHeaderLayoutY not yet wired — watch push vs overlap). */}
      <Text style={{ color: '#41506a', fontSize: 13 }}>SectionList · sticky (scroll: next header should push prev off)</Text>
      <SectionList
        sections={paritySections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled
        style={{ height: 200, borderRadius: 10, backgroundColor: '#0f1e30' }}
        renderSectionHeader={({ section }) => (
          <Text style={{ color: '#0b1622', fontSize: 13, fontWeight: 'bold', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#7fb5ff' }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <View style={{ height: PARITY_ROW_H, justifyContent: 'center', paddingHorizontal: 12 }}>
            <Text style={{ color: '#cbd5e1', fontSize: 14 }}>{item.label}</Text>
          </View>
        )}
      />

      {/* #14 a11y focus — node-based sendAccessibilityEvent routes through the Fabric
          slot on both platforms (enable TalkBack/VoiceOver to feel the focus jump) */}
      <Button
        title="Focus the panel title (a11y)"
        onPress={() => {
          if (titleRef.current !== null) {
            AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus')
          }
        }}
        color="#7fb5ff"
      />
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
  // #6 Android-only StatusBar window flags — the blank-risk pair (device-verify-pending).
  const [statusBarRed, setStatusBarRed] = useState(false)
  const [statusBarTranslucent, setStatusBarTranslucent] = useState(false)

  // Feature-parity device checks — state for the cluster before the final logo.
  const [retentionMove, setRetentionMove] = useState({ dx: 0, dy: 0 })
  const [mvcpItems, setMvcpItems] = useState(() =>
    Array.from({ length: 20 }, (_value, index) => ({ id: `row-${index}`, label: `item ${index}` })),
  )
  const mvcpHead = useRef(0)
  // native-driver scroll value: Animated.event attaches it on the UI thread, so the
  // header opacity/translateY are driven without a JS frame per scroll tick.
  const parityScrollY = useRef(new Animated.Value(0)).current
  const [kavEnabled, setKavEnabled] = useState(true)

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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1622' }}>
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
      {/* #6 Android-only window flags — the blank-risk pair. PASS: the top strip turns
          red / goes translucent and the app STAYS rendered. FAIL: the surface blanks
          (white screen) — watch logcat for stopSurface / "reactInstance is null". */}
      {Platform.OS === 'android' && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              title={statusBarRed ? 'BG default' : 'BG red'}
              onPress={() => {
                const next = !statusBarRed
                setStatusBarRed(next)
                StatusBar.setBackgroundColor(next ? '#ff0000' : '#101a2c', true)
              }}
              color="#7fb5ff"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title={statusBarTranslucent ? 'Opaque' : 'Translucent'}
              onPress={() => {
                const next = !statusBarTranslucent
                setStatusBarTranslucent(next)
                StatusBar.setTranslucent(next)
              }}
              color="#7fb5ff"
            />
          </View>
        </View>
      )}
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

      {/* Accessibility — a11y props to native, aria/role transform, AccessibilityInfo */}
      <AccessibilityDemo />

      {/* Responder — drag-vs-tap + mid-gesture transfer (move-should-set / takeover) */}
      <ResponderDemo />

      {/* Parity checks — longPress · Keyboard.dismiss · animated scroll · sticky · a11y focus */}
      <ParityDemo />

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

      {/* ===== feature-parity device checks ===== */}

      {/* Press-retention measured rect. PASS: press, then drag DOWN ~100px — the panel
          STAYS highlighted (inside the measured rect + 80px bottom retention). Drag UP
          off the top — highlight drops. Proves measured-rect retention replaced the old
          symmetric-radius approximation. The dx/dy readout tracks the move offset. */}
      <Pressable
        hitSlop={{ top: 0, bottom: 40, left: 0, right: 0 }}
        pressRetentionOffset={{ top: 0, bottom: 80, left: 0, right: 0 }}
        onPressMove={event =>
          setRetentionMove({
            dx: Math.round(event.nativeEvent.locationX),
            dy: Math.round(event.nativeEvent.locationY),
          })
        }
        style={({ pressed }) => ({
          height: 64,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? '#2b6cb0' : '#13243a',
        })}>
        <Text style={{ color: '#cbd5e1', fontSize: 14 }}>
          {`drag me · dx ${retentionMove.dx} · dy ${retentionMove.dy}`}
        </Text>
      </Pressable>

      {/* maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend — the rows
          you are looking at DO NOT jump; new items appear above without shifting the
          viewport. FAIL: the list jumps to the top. */}
      <Text style={{ color: '#41506a', fontSize: 13 }}>MVCP · prepend without jump</Text>
      <FlatList
        data={mvcpItems}
        keyExtractor={item => item.id}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        style={{ height: 160, borderRadius: 12, backgroundColor: '#0f1e30' }}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={{ color: '#cbd5e1', fontSize: 15 }}>{item.label}</Text>
          </View>
        )}
      />
      <Button
        title="Prepend 5"
        color="#7fb5ff"
        onPress={() => {
          mvcpHead.current -= 5
          const head = mvcpHead.current
          const prepended = Array.from({ length: 5 }, (_value, index) => {
            const n = head + index
            return { id: `row-${n}`, label: `item ${n}` }
          })
          setMvcpItems(items => [...prepended, ...items])
        }}
      />

      {/* Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the
          box below (not the page) — the bright bar above SMOOTHLY fades to near-invisible
          and lifts, on the UI thread (no jank, no per-frame JS). Proves Animated.ScrollView
          + Animated.event native attach. */}
      <Animated.View
        style={{
          backgroundColor: '#2b6cb0',
          borderRadius: 12,
          paddingVertical: 12,
          alignItems: 'center',
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
        }}>
        <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: 'bold' }}>
          HEADER — fades as you scroll ↓
        </Text>
      </Animated.View>
      <Animated.ScrollView
        style={{ height: 160, borderRadius: 12, backgroundColor: '#0f1e30' }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: parityScrollY } } }],
          { useNativeDriver: true },
        )}>
        {Array.from({ length: 6 }, (_value, index) => (
          <View key={index} style={{ height: 80, justifyContent: 'center', paddingHorizontal: 14 }}>
            <Text style={{ color: '#cbd5e1', fontSize: 15 }}>{`scroll me · row ${index}`}</Text>
          </View>
        ))}
      </Animated.ScrollView>
      <Text style={{ color: '#41506a', fontSize: 12, textAlign: 'center' }}>
        ↑ drag inside the box — the bar above reacts
      </Text>

      {/* Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect
          is unmistakable on the dark theme. */}
      {/* boxShadow — a BLUE glow (a black shadow is invisible on the near-black bg).
          PASS: a soft blue halo bleeds out around the panel. */}
      <View
        style={{
          height: 64,
          borderRadius: 12,
          backgroundColor: '#13243a',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0px 0px 22px 3px rgba(127,181,255,0.85)',
        }}>
        <Text style={{ color: '#cbd5e1', fontSize: 13 }}>boxShadow · blue glow</Text>
      </View>
      {/* filter — same base colour both sides; the right one is darkened by
          brightness(0.5). PASS: the right panel is clearly darker than the left. */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View
          style={{
            flex: 1,
            height: 64,
            borderRadius: 12,
            backgroundColor: '#2b6cb0',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ color: '#ffffff', fontSize: 13 }}>no filter</Text>
        </View>
        <View
          style={{
            flex: 1,
            height: 64,
            borderRadius: 12,
            backgroundColor: '#2b6cb0',
            alignItems: 'center',
            justifyContent: 'center',
            filter: [{ brightness: 0.5 }],
          }}>
          <Text style={{ color: '#ffffff', fontSize: 13 }}>brightness 0.5</Text>
        </View>
      </View>
      {/* transformOrigin — the panel rotates around its TOP-LEFT corner, not its centre.
          PASS: the left edge stays put while the bottom-right swings down. */}
      <View
        style={{
          height: 64,
          borderRadius: 12,
          backgroundColor: '#2b6cb0',
          alignItems: 'center',
          justifyContent: 'center',
          transformOrigin: 'top left',
          transform: [{ rotate: '4deg' }],
        }}>
        <Text style={{ color: '#ffffff', fontSize: 13 }}>transformOrigin · top-left</Text>
      </View>

      {/* Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
          width/height→style); a screen reader reads "React logo" (alt→accessibilityLabel). */}
      <Image
        src="https://reactnative.dev/img/tiny_logo.png"
        alt="React logo"
        width={48}
        height={48}
        style={{ borderRadius: 8, alignSelf: 'center' }}
      />

      {/* KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field
          lifts it above the keyboard AND the keyboard is the email layout (proves
          autoComplete/inputMode fold); with enabled OFF the keyboard covers the field. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
        }}>
        <Text style={{ color: '#cbd5e1', fontSize: 16 }}>avoid keyboard</Text>
        <Switch
          value={kavEnabled}
          onValueChange={setKavEnabled}
          trackColor={{ false: '#334155', true: '#2b6cb0' }}
        />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={kavEnabled}>
        <TextInput
          autoComplete="email"
          inputMode="email"
          enterKeyHint="done"
          placeholder="email — focus me near the bottom…"
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
      </KeyboardAvoidingView>

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
    </SafeAreaView>
  )
}

export default App
