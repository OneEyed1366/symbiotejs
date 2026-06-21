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

import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
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
          ` · ${Platform.select({ ios: 'native ios', default: '?' })}` +
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
        <View style={{ flex: 1 }}>
          <Button title="Action sheet" onPress={onActionSheet} color="#7fb5ff" />
        </View>
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
