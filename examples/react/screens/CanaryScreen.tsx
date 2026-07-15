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
  createPortal,
  createTunnel,
  type IHostInstance,
} from '@symbiote-native/react';
// A real third-party native view, driven through symbiote's own wrapper (@symbiote-native/slider)
// rather than the library's React component: the wrapper registers RNCSlider's ViewConfig and
// renders the native leaf through the engine, so the SAME slider works on Vue/Angular too. App
// code and the app manifest name only @symbiote-native/slider; the native package is the wrapper's dep.
import { Slider } from '@symbiote-native/slider/react';
import { ActionButton } from '../components/ActionButton';
import { AnimatedDemo } from '../components/AnimatedDemo';
import { AnimatedParityDemo } from '../components/AnimatedParityDemo';
import { NativeModulesDemo } from '../components/NativeModulesDemo';
import { RefApiDemo } from '../components/RefApiDemo';
import { PlatformColorDemo } from '../components/PlatformColorDemo';
import { AccessibilityDemo } from '../components/AccessibilityDemo';
import { ResponderDemo } from '../components/ResponderDemo';
import { ParityDemo } from '../components/ParityDemo';
import { nativeNumber } from '../components/event-utils';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const CHIP_WIDTH = 72;
const CHIP_GAP = 12;
const REFRESH_MS = 2000;

const chips = Array.from({ length: 24 }, (_, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}));

// A module-level singleton (not created inside the component) — the whole point of createTunnel
// is that its In/Out don't need to share a component instance, only this store.
const overlayTunnel = createTunnel();

/**
 * Symbiote canary screen. Every primitive here (View, Text, ScrollView, TextInput,
 * Image, Switch, ActivityIndicator, Button, Pressable, Modal, FlatList,
 * RefreshControl) comes from @symbiote-native/react, not react-native. The tree is
 * rendered by our own react-reconciler host config straight onto Fabric; React
 * Native's renderer is never involved. Run with DEBUG=1 to watch each interaction
 * commit incrementally (created=0, only the touched branch clones) in Metro's logs.
 */
export function CanaryScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');
  const [spinning, setSpinning] = useState(true);
  const [volume, setVolume] = useState(0.5);
  const [modalVisible, setModalVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [tunnelToastVisible, setTunnelToastVisible] = useState(false);
  // A ref callback (not useRef): refs attach during commit, after render returns, so
  // useRef's .current would still read null on the very first render.
  const [overlayHost, setOverlayHost] = useState<IHostInstance | null>(null);
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
            tintColor={LINE_COLOR.primitives}
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
        <View className="line-tag line-tag-primitives">
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: LINE_COLOR.primitives }}>
            <Text className="hero-badge-text">CN</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">All primitives</Text>
            <Text className="hero-body">
              Every @symbiote-native/react primitive, driven straight onto Fabric — no react-native
              renderer in the path.
            </Text>
          </View>
        </View>
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
            <ActionButton
              title={statusBarHidden ? 'Show status bar' : 'Hide status bar'}
              onPress={() => setStatusBarHidden(value => !value)}
              color={LINE_COLOR.primitives}
            />
          </View>
          <View className="flex1">
            <ActionButton
              title={darkStatusBar ? 'Light text' : 'Dark text'}
              onPress={() => setDarkStatusBar(value => !value)}
              color={LINE_COLOR.primitives}
            />
          </View>
        </View>
        {/* #6 Android-only window flags: the blank-risk pair. PASS: the top strip turns
          red / goes translucent and the app STAYS rendered. FAIL: the surface blanks
          (white screen); watch logcat for stopSurface / "reactInstance is null". */}
        {Platform.OS === 'android' && (
          <View className="row">
            <View className="flex1">
              <ActionButton
                title={statusBarRed ? 'BG default' : 'BG red'}
                onPress={() => {
                  const next = !statusBarRed;
                  setStatusBarRed(next);
                  StatusBar.setBackgroundColor(
                    next ? '#ff0000' : '#101a2c',
                    true,
                  );
                }}
                color={LINE_COLOR.primitives}
              />
            </View>
            <View className="flex1">
              <ActionButton
                title={statusBarTranslucent ? 'Opaque' : 'Translucent'}
                onPress={() => {
                  const next = !statusBarTranslucent;
                  setStatusBarTranslucent(next);
                  StatusBar.setTranslucent(next);
                }}
                color={LINE_COLOR.primitives}
              />
            </View>
          </View>
        )}
        {/* JS->native imperative modules: tap to fire the real native UI / haptics.
          Each working button proves its module name resolved on the bridgeless host. */}
        <View className="row">
          <View className="flex1">
            <ActionButton title="Alert" onPress={onAlert} color={LINE_COLOR.primitives} />
          </View>
          {/* ActionSheetIOS drives the iOS-only ActionSheetManager; no Android native
            module exists, so the control is iOS-only by design (not a gap). */}
          {Platform.OS !== 'android' && (
            <View className="flex1">
              <ActionButton
                title="Action sheet"
                onPress={onActionSheet}
                color={LINE_COLOR.primitives}
              />
            </View>
          )}
        </View>
        <View className="row">
          <View className="flex1">
            <ActionButton title="Share" onPress={onShare} color={LINE_COLOR.primitives} />
          </View>
          <View className="flex1">
            <ActionButton
              title="Vibrate"
              onPress={() => Vibration.vibrate()}
              color={LINE_COLOR.primitives}
            />
          </View>
        </View>
        <ActionButton
          title="Open reactnative.dev"
          onPress={onOpenUrl}
          color={LINE_COLOR.primitives}
        />

        {/* The native UIRefreshControl spinner only shows while iOS holds the scroll
          view pulled-down; our full re-commit snaps the offset back, so we drive
          our OWN indicator from the same `refreshing` flag, guaranteed visible. */}
        {refreshing ? (
          <View className="refresh-row">
            <ActivityIndicator color={LINE_COLOR.primitives} />
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
            trackColor={{ false: '#334155', true: LINE_COLOR.primitives }}
          />
        </View>
        <ActivityIndicator
          testID="spinner-indicator"
          animating={spinning}
          color={LINE_COLOR.primitives}
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
            minimumTrackTintColor={LINE_COLOR.primitives}
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

        {/* Opens a Modal */}
        <ActionButton
          testID="modal-open"
          title="Open modal"
          onPress={() => setModalVisible(true)}
          color={LINE_COLOR.primitives}
        />

        {/* Pressable's static look lives in .pressable-card; only the press-state-dependent
          colors stay a style function. */}
        <Pressable
          onPress={() => setCount(value => value + 1)}
          className="pressable-card"
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#0b1622' : '#13243a',
            borderColor: LINE_COLOR.primitives,
          })}
        >
          {({ pressed }) => (
            <Text
              className="pressable-label"
              style={{ color: pressed ? LINE_COLOR.primitives : '#cbd5e1' }}
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
            backgroundColor: pressed ? LINE_COLOR.primitives : '#13243a',
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
        <ActionButton
          title="Prepend 5"
          color={LINE_COLOR.primitives}
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
        <ActionButton
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
          style={{ boxShadow: '0px 0px 22px 3px rgba(20,158,202,0.85)' }}
        >
          <Text className="note-text">boxShadow · glow</Text>
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
              <ActionButton
                testID="modal-close"
                title="Close"
                onPress={() => setModalVisible(false)}
                color={LINE_COLOR.primitives}
              />
            </View>
          </View>
        </Modal>

        {/* createPortal: moves the toast card OUT of this scroll content and INTO the
            overlay-host View rendered as a sibling of ScrollView below — same surface, so it
            repaints on the ONE commit this tree already does. */}
        <ActionButton
          testID="toast-open"
          title="Show toast (createPortal)"
          onPress={() => setToastVisible(true)}
          color={LINE_COLOR.primitives}
        />
        {toastVisible &&
          overlayHost &&
          createPortal(
            <View testID="toast-card" className="modal-card">
              <Text className="modal-body">Ported via createPortal ✦</Text>
              <ActionButton
                testID="toast-dismiss"
                title="Dismiss"
                onPress={() => setToastVisible(false)}
                color={LINE_COLOR.primitives}
              />
            </View>,
            overlayHost,
          )}

        {/* createTunnel: no ref, no target node — In just registers its children from wherever
            it's mounted; Out (rendered in the overlay host below) reads them back through its
            OWN normal render, wherever that happens to be mounted, even a different surface. */}
        <ActionButton
          testID="tunnel-toast-open"
          title="Show toast (createTunnel)"
          onPress={() => setTunnelToastVisible(true)}
          color={LINE_COLOR.primitives}
        />
        {tunnelToastVisible && (
          <overlayTunnel.In>
            <View testID="tunnel-toast-card" className="modal-card">
              <Text className="modal-body">Ported via createTunnel ✦</Text>
              <ActionButton
                testID="tunnel-toast-dismiss"
                title="Dismiss"
                onPress={() => setTunnelToastVisible(false)}
                color={LINE_COLOR.primitives}
              />
            </View>
          </overlayTunnel.In>
        )}
      </ScrollView>

      {/* The portal/tunnel target: a persistent, empty View sitting above the scroll content.
          pointerEvents="box-none" lets touches pass through everywhere except an actual ported
          child (the toast card). Rendered here — a sibling of ScrollView, same surface — so
          createPortal above can reach it via the callback ref; createTunnel's Out below works
          identically wherever it's mounted. */}
      <View
        testID="overlay-host"
        ref={setOverlayHost}
        pointerEvents="box-none"
        className="overlay-host"
      >
        <overlayTunnel.Out />
      </View>
    </SafeAreaView>
  );
}
