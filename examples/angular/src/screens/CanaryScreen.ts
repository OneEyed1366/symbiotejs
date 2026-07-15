import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import {
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Animated,
  AnimatedScrollView,
  AnimatedView,
  AppState,
  ColorSchemeService,
  FlatList,
  Image,
  ImageBackground,
  KEYBOARD_EVENT,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PixelRatio,
  Platform,
  PortalDirective,
  PortalOutletDirective,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TunnelInDirective,
  TunnelOut,
  VListItemDirective,
  Vibration,
  View,
  WindowDimensionsService,
  createTunnel,
  type ISymbioteEvent,
} from '@symbiote-native/angular';
// A real third-party native view, driven through symbiote's own wrapper (@symbiote-native/slider)
// rather than the library's React component — the wrapper renders through DescriptorOutlet
// (descriptorToAngular), so the SAME slider works on React/Vue/Angular. App code and the app
// manifest name only @symbiote-native/slider; the native package is the wrapper's own dependency.
import { Slider } from '@symbiote-native/slider/angular';
import { hide } from '@symbiote-native/splash-screen/angular';
import { AccessibilityDemo } from '../components/AccessibilityDemo';
import { ActionButton } from '../components/ActionButton';
import { AnimatedDemo } from '../components/AnimatedDemo';
import { AnimatedParityDemo } from '../components/AnimatedParityDemo';
import { NativeModulesDemo } from '../components/NativeModulesDemo';
import { ParityDemo } from '../components/ParityDemo';
import { PlatformColorDemo } from '../components/PlatformColorDemo';
import { RefApiDemo } from '../components/RefApiDemo';
import { ResponderDemo } from '../components/ResponderDemo';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const ANGULAR_LOGO_URI =
  'https://angular.io/assets/images/logos/angular/angular.png';
const CHIP_WIDTH = 72;
const CHIP_GAP = 12;
const REFRESH_MS = 2000;

interface IChip {
  id: string;
  index: number;
  color: string;
}

interface IMvcpItem {
  id: string;
  label: string;
}

const chips: IChip[] = Array.from({ length: 24 }, (_unused, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 72% 56%)`,
}));

// A module-level singleton (NOT created inside AppComponent) — the whole point of createTunnel
// is that TunnelIn/TunnelOut don't need to share a component instance, only this store.
const overlayTunnel = createTunnel();

@Component({
  selector: 'CanaryScreen',
  standalone: true,
  imports: [
    AccessibilityDemo,
    ActionButton,
    ActivityIndicator,
    AnimatedDemo,
    AnimatedParityDemo,
    AnimatedScrollView,
    AnimatedView,
    FlatList,
    Image,
    ImageBackground,
    KeyboardAvoidingView,
    Modal,
    NativeModulesDemo,
    ParityDemo,
    PlatformColorDemo,
    PortalDirective,
    PortalOutletDirective,
    Pressable,
    RefApiDemo,
    RefreshControl,
    ResponderDemo,
    SafeAreaView,
    ScrollView,
    Slider,
    Switch,
    Text,
    TextInput,
    TunnelInDirective,
    TunnelOut,
    View,
    VListItemDirective,
  ],
  template: `
    <SafeAreaView testID="angular-safe-area" class="screen">
      <ScrollView
        testID="angular-canary-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <RefreshControl
          testID="angular-refresh-control"
          [refreshing]="refreshing"
          (refresh)="onRefresh()"
          tintColor="#dd0031"
        />

        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View testID="angular-hero" class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">CN</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">All primitives</Text>
            <Text class="hero-body">
              Every @symbiote-native/angular primitive, driven straight onto Fabric — no
              react-native renderer in the path.
            </Text>
          </View>
        </View>

        <Text
          testID="angular-platform"
          class="hairline-note"
          [style]="platformHairlineStyle"
        >
          {{ platformText }}
        </Text>
        <Text testID="angular-dimensions" class="header-note">
          {{ dimensionsText }}
        </Text>
        <Text testID="angular-keyboard" class="header-note">
          {{
            keyboardHeight > 0
              ? 'keyboard up · ' + keyboardHeight + 'px'
              : 'keyboard down'
          }}
        </Text>

        <View class="row">
          <View class="flex-1">
            <ActionButton
              testID="angular-status-bar-hidden-btn"
              [title]="statusBarHidden ? 'Show status bar' : 'Hide status bar'"
              (press)="toggleStatusBarHidden()"
              color="#dd0031"
            ></ActionButton>
          </View>
          <View class="flex-1">
            <ActionButton
              testID="angular-status-bar-style-btn"
              [title]="darkStatusBar ? 'Light text' : 'Dark text'"
              (press)="toggleStatusBarStyle()"
              color="#dd0031"
            ></ActionButton>
          </View>
        </View>

        @if (Platform.OS === 'android') {
          <View class="row">
            <View class="flex-1">
              <ActionButton
                testID="angular-status-bar-bg-btn"
                [title]="statusBarRed ? 'BG default' : 'BG red'"
                (press)="toggleStatusBarRed()"
                color="#dd0031"
              ></ActionButton>
            </View>
            <View class="flex-1">
              <ActionButton
                testID="angular-status-bar-translucent-btn"
                [title]="statusBarTranslucent ? 'Opaque' : 'Translucent'"
                (press)="toggleStatusBarTranslucent()"
                color="#dd0031"
              ></ActionButton>
            </View>
          </View>
        }

        <View class="row">
          <View class="flex-1">
            <ActionButton
              testID="angular-alert-btn"
              title="Alert"
              (press)="onAlert()"
              color="#dd0031"
            ></ActionButton>
          </View>
          @if (Platform.OS !== 'android') {
            <View class="flex-1">
              <ActionButton
                testID="angular-action-sheet-btn"
                title="Action sheet"
                (press)="onActionSheet()"
                color="#dd0031"
              ></ActionButton>
            </View>
          }
        </View>
        <View class="row">
          <View class="flex-1">
            <ActionButton
              testID="angular-share-btn"
              title="Share"
              (press)="onShare()"
              color="#dd0031"
            ></ActionButton>
          </View>
          <View class="flex-1">
            <ActionButton
              testID="angular-vibrate-btn"
              title="Vibrate"
              (press)="onVibrate()"
              color="#dd0031"
            ></ActionButton>
          </View>
        </View>
        <ActionButton
          testID="angular-open-url-btn"
          title="Open angular.dev"
          (press)="onOpenUrl()"
          color="#dd0031"
        ></ActionButton>

        <Pressable
          testID="angular-counter-card"
          class="counter-card"
          (press)="increment()"
        >
          <Text testID="angular-counter-value" class="counter-text">tapped {{ count }}×</Text>
        </Pressable>

        <TextInput
          testID="angular-greeting-input"
          [(value)]="name"
          placeholder="type your name…"
          placeholderTextColor="#6b7280"
          class="text-input"
        />
        <Text testID="angular-greeting-output" class="greeting">{{ name ? 'Hello, ' + name : 'Hello, stranger' }}</Text>

        <View testID="angular-switch-row" class="switch-row">
          <Text class="switch-label">spinner</Text>
          <Switch
            testID="angular-spinner-switch"
            [(value)]="spinning"
            [trackColor]="switchTrackColor"
            thumbColor="#ffffff"
          />
        </View>
        <ActivityIndicator
          testID="angular-spinner-indicator"
          [animating]="spinning"
          color="#dd0031"
          size="large"
        />

        <View testID="angular-native-row" class="native-row">
          <ActivityIndicator
            testID="angular-small-spinner"
            [animating]="true"
            color="#dd0031"
            size="small"
            [hidesWhenStopped]="true"
            class="spinner"
          />
          <Text class="native-row-text">
            host intrinsics exported from @symbiote-native/angular
          </Text>
        </View>

        <View class="section-tight">
          <Text class="switch-label">volume · {{ volumePercent }}%</Text>
          <Slider
            testID="angular-volume-slider"
            [(value)]="volume"
            [minimumValue]="0"
            [maximumValue]="1"
            [step]="0.01"
            minimumTrackTintColor="#dd0031"
            maximumTrackTintColor="#334155"
            thumbTintColor="#ffffff"
            class="slider"
          />
        </View>

        <AnimatedDemo></AnimatedDemo>
        <AnimatedParityDemo></AnimatedParityDemo>
        <NativeModulesDemo></NativeModulesDemo>
        <RefApiDemo></RefApiDemo>
        <PlatformColorDemo></PlatformColorDemo>
        <AccessibilityDemo></AccessibilityDemo>
        <ResponderDemo></ResponderDemo>
        <ParityDemo></ParityDemo>

        <Pressable
          testID="angular-pressable"
          (press)="increment()"
          [style]="pressableStyle"
          accessibilityLabel="Angular pressable counter"
        >
          <Text class="pressable-label">press me (also +1)</Text>
        </Pressable>

        <Text class="section-label"> FlatList · 24 chips, windowed </Text>
        <FlatList
          testID="angular-chips-list"
          [horizontal]="true"
          [data]="chips"
          [keyExtractor]="chipKeyExtractor"
          [getItemLayout]="chipItemLayout"
          class="chip-list"
        >
          <ng-template vListItem let-item>
            <View class="chip-card" [style]="chipStyle(item)">
              <Text class="chip-number">{{ chipIndex(item) }}</Text>
            </View>
          </ng-template>
        </FlatList>

        <!-- Press-retention measured rect. PASS: press, then drag DOWN ~100px: the panel
            STAYS highlighted (inside the measured rect + 80px bottom retention). Drag UP
            off the top: highlight drops. Proves measured-rect retention rather than a
            symmetric-radius approximation. -->
        <Pressable
          testID="angular-retention-pressable"
          [hitSlop]="{ top: 0, bottom: 40, left: 0, right: 0 }"
          [pressRetentionOffset]="{ top: 0, bottom: 80, left: 0, right: 0 }"
          (pressMove)="onRetentionMove($event)"
          [style]="retentionStyle"
        >
          <Text testID="angular-retention-readout" class="info-text">
            drag me · dx {{ retentionMove.dx }} · dy {{ retentionMove.dy }}
          </Text>
        </Pressable>

        <Text class="section-label">MVCP · prepend without jump</Text>
        <FlatList
          testID="angular-mvcp-list"
          [data]="mvcpItems"
          [keyExtractor]="mvcpKeyExtractor"
          [maintainVisibleContentPosition]="mvcpConfig"
          class="box-list160"
        >
          <ng-template vListItem let-item>
            <View class="mvcp-row">
              <Text class="list-row-text">{{ mvcpLabel(item) }}</Text>
            </View>
          </ng-template>
        </FlatList>
        <ActionButton
          testID="angular-mvcp-prepend-btn"
          title="Prepend 5"
          color="#dd0031"
          (press)="prependMvcpItems()"
        ></ActionButton>

        <!-- Animated.ScrollView scroll-driven header (native driver). PASS: drag INSIDE the
            box below (not the page): the bright bar above SMOOTHLY fades to near-invisible and
            lifts, on the UI thread (no jank, no per-frame JS). AnimatedScrollView takes onScroll
            through [animatedProps] (no discrete [onScroll] input) — the general escape hatch for
            any prop that may carry an Animated.event marker, same as AnimatedParityDemo's
            panHandlers. -->
        <AnimatedView
          testID="angular-parity-header"
          class="parity-header"
          [style]="parityHeaderStyle"
        >
          <Text class="parity-header-text">HEADER — fades as you scroll ↓</Text>
        </AnimatedView>
        <AnimatedScrollView
          testID="angular-parity-scroll-box"
          class="box-list160"
          [animatedProps]="scrollAnimatedProps"
        >
          @for (i of scrollRows; track i) {
            <View class="scroll-demo-row">
              <Text class="list-row-text">scroll me · row {{ i }}</Text>
            </View>
          }
        </AnimatedScrollView>
        <Text class="tiny-center"
          >↑ drag inside the box — the bar above reacts</Text
        >
        <!-- Native-driver proof for Animated.event: tap to JAM the JS thread 3s, then drag
            the box above DURING the freeze. If the bar keeps fading/lifting while JS is frozen,
            the scroll event drives parityScrollY on the UI thread (native attach). -->
        <ActionButton
          testID="angular-freeze-js-scroll-btn"
          title="Freeze JS 3s — then scroll the box ↑"
          color="#fc8181"
          (press)="freezeJsScroll()"
        ></ActionButton>
        <Text class="tiny-center"
          >tap Freeze, then immediately drag the box — bar should still
          move</Text
        >

        <!-- Modern style props reaching Fabric's C++ parser. Each is an A/B so the effect
            is unmistakable on the dark theme. -->
        <View class="shadow-card">
          <Text class="note-text">boxShadow · blue glow</Text>
        </View>
        <View class="row">
          <View class="filter-tile">
            <Text class="tile-text">no filter</Text>
          </View>
          <View class="filter-tile filter-tile-dim">
            <Text class="tile-text">brightness 0.5</Text>
          </View>
        </View>
        <View class="rotated-card">
          <Text class="tile-text">transformOrigin · top-left</Text>
        </View>

        <!-- background-image: a CSS linear-gradient(...) authored entirely in App.css
            (.gradient-card), proving @symbiote-native/css-parser's background-image to RN's
            experimental_backgroundImage raw passthrough works end to end.
            PASS: the panel shows a red-to-orange gradient sweeping left to right. -->
        <View class="gradient-card">
          <Text class="tile-text">background-image · linear-gradient</Text>
        </View>

        <!-- Image web aliases. PASS: the logo loads via the web-alias fold (src→source uri,
            width/height→style); a screen reader reads "Angular logo" (alt→accessibilityLabel). -->
        <Image
          testID="angular-image"
          [src]="angularLogoUri"
          alt="Angular logo"
          [width]="48"
          [height]="48"
          class="web-image"
        />

        <!-- KeyboardAvoidingView enabled toggle. PASS: with enabled ON, focusing the field
            lifts it above the keyboard AND the keyboard is the email layout (proves
            autoComplete/inputMode fold); with enabled OFF the keyboard covers the field. -->
        <View class="switch-row">
          <Text class="switch-label">avoid keyboard</Text>
          <Switch
            testID="angular-kav-switch"
            [(value)]="kavEnabled"
            [trackColor]="switchTrackColor"
          />
        </View>
        <KeyboardAvoidingView
          [behavior]="Platform.OS === 'ios' ? 'padding' : 'height'"
          [enabled]="kavEnabled"
        >
          <TextInput
            testID="angular-email-input"
            autoComplete="email"
            inputMode="email"
            enterKeyHint="done"
            placeholder="email — focus me near the bottom…"
            placeholderTextColor="#6b7280"
            class="text-input"
          />
        </KeyboardAvoidingView>

        <Image [src]="angularLogoUri" alt="Angular logo" class="logo-image" />

        <View class="bottom-card">
          <Text class="bottom-text">↑ you scrolled to the bottom</Text>
        </View>

        <ActionButton
          testID="angular-open-modal"
          title="Open modal"
          (press)="openModal()"
          [color]="lineColorPrimitives"
        ></ActionButton>
        <Modal
          testID="angular-modal"
          [visible]="modalVisible"
          animationType="fade"
          [transparent]="true"
          (requestClose)="closeModal()"
        >
          <View class="modal-overlay">
            <View testID="angular-modal-card" class="modal-card">
              <Text class="modal-title">Angular Modal</Text>
              <Text class="modal-body">
                Committed through the same Fabric childSet from the Angular
                adapter.
              </Text>
              <ActionButton
                testID="angular-close-modal"
                title="Close"
                (press)="closeModal()"
                [color]="lineColorPrimitives"
              ></ActionButton>
            </View>
          </View>
        </Modal>

        <!-- createPortal: moves the toast card OUT of this scroll content and INTO the
            overlay-host View rendered as a sibling of ScrollView below — same surface, so it
            repaints on the ONE change-detection pass this tree already runs. *portal is a
            structural directive, same idiom as *ngIf: it sits directly on the content, no
            separate <ng-template>/[content] indirection. -->
        <ActionButton
          testID="angular-toast-open"
          title="Show toast (createPortal)"
          (press)="showToast()"
          [color]="lineColorPrimitives"
        ></ActionButton>
        @if (toastVisible) {
          <View
            *portal="overlayHost"
            testID="angular-toast-card"
            class="modal-card"
          >
            <Text class="modal-body">Ported via createPortal ✦</Text>
            <ActionButton
              testID="angular-toast-dismiss-btn"
              title="Dismiss"
              (press)="dismissToast()"
              [color]="lineColorPrimitives"
            ></ActionButton>
          </View>
        }

        <!-- createTunnel: no ref, no target node — *tunnelIn sits directly on the content
            (same structural-directive idiom as *portal above); tunnel-out (rendered in the
            overlay host below) reads it back through its OWN normal render, wherever that
            happens to be mounted, even a different mounted surface entirely. -->
        <ActionButton
          testID="angular-tunnel-toast-open"
          title="Show toast (createTunnel)"
          (press)="showTunnelToast()"
          [color]="lineColorPrimitives"
        ></ActionButton>
        @if (tunnelToastVisible) {
          <View
            *tunnelIn="overlayTunnel"
            testID="angular-tunnel-toast-card"
            class="modal-card"
          >
            <Text class="modal-body">Ported via createTunnel ✦</Text>
            <ActionButton
              testID="angular-tunnel-toast-dismiss-btn"
              title="Dismiss"
              (press)="dismissTunnelToast()"
              [color]="lineColorPrimitives"
            ></ActionButton>
          </View>
        }

        <ImageBackground
          testID="angular-image-bg"
          [src]="angularLogoUri"
          alt="Angular image background"
          resizeMode="cover"
          class="image-background"
          imageStyle="image-background-image"
        >
          <Text testID="angular-image-bg-label" class="image-background-label">
            Angular children paint on top of the image
          </Text>
        </ImageBackground>
      </ScrollView>

      <!-- The portal target: a persistent, empty View sitting above the scroll content.
          pointerEvents="box-none" lets touches pass through everywhere except an actual
          ported child (the toast card). Rendered here — a sibling of ScrollView, same
          surface — so createPortal above can reach it via its exported ViewContainerRef;
          createTunnel's Out below works identically wherever it's mounted. -->
      <View
        testID="angular-overlay-host"
        portalOutlet
        #overlayHost="portalOutlet"
        pointerEvents="box-none"
        class="overlay-host"
      >
        <tunnel-out [tunnel]="overlayTunnel" />
      </View>
    </SafeAreaView>
  `,
})
export class CanaryScreen implements OnInit, OnDestroy {
  private readonly windowDimensions = inject(WindowDimensionsService)
    .dimensions;
  private readonly colorScheme = inject(ColorSchemeService).colorScheme;
  private readonly changeDetector = inject(ChangeDetectorRef);

  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Canary];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.primitives };
  readonly lineColorPrimitives = LINE_COLOR.primitives;

  readonly Platform = Platform;
  readonly angularLogoUri = ANGULAR_LOGO_URI;
  readonly chips = chips;
  readonly switchTrackColor = { false: '#334155', true: '#dd0031' };
  readonly mvcpConfig = { minIndexForVisible: 0 };
  readonly platformHairlineStyle = { borderTopWidth: StyleSheet.hairlineWidth };

  count = 0;
  name = '';
  spinning = true;
  volume = 0.5;
  refreshing = false;
  keyboardHeight = 0;
  statusBarHidden = false;
  darkStatusBar = false;
  statusBarRed = false;
  statusBarTranslucent = false;
  modalVisible = false;
  toastVisible = false;
  tunnelToastVisible = false;
  readonly overlayTunnel = overlayTunnel;
  kavEnabled = true;
  appState = AppState.currentState ?? 'unknown';
  mvcpHead = 0;
  mvcpItems: IMvcpItem[] = Array.from({ length: 20 }, (_value, index) => ({
    id: `row-${index}`,
    label: `item ${index}`,
  }));
  retentionMove = { dx: 0, dy: 0 };
  // 0..5, so the keyed loop matches the other canaries' index-keyed 6-row scroll demo.
  readonly scrollRows = Array.from({ length: 6 }, (_value, index) => index);

  // native-driver scroll value: Animated.event attaches it on the UI thread, so the header
  // opacity/translateY are driven without a JS frame per scroll tick.
  private readonly parityScrollY = new Animated.Value(0);
  readonly parityHeaderOpacity = this.parityScrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0.12],
    extrapolate: 'clamp',
  });
  readonly parityHeaderTranslateY = this.parityScrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, -16],
    extrapolate: 'clamp',
  });
  readonly onParityScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: this.parityScrollY } } }],
    { useNativeDriver: true },
  );
  // STABLE object references for [style]/[animatedProps], mirroring AnimatedParityDemo's
  // [animatedProps]="panResponder.panHandlers". A fresh object literal written directly in the
  // template re-evaluates to a new reference on every change-detection pass of this root
  // component (which every press anywhere in the app triggers via markForCheck bubbling to
  // root), so the Animated wrapper's ngOnChanges fired constantly, tearing down and
  // re-attaching its native binding on every unrelated interaction elsewhere in the app
  // instead of only reacting to the scroll itself.
  readonly parityHeaderStyle = {
    opacity: this.parityHeaderOpacity,
    transform: [{ translateY: this.parityHeaderTranslateY }],
  };
  readonly scrollAnimatedProps = {
    onScroll: this.onParityScroll,
    scrollEventThrottle: 16,
  };

  get volumePercent(): number {
    return Math.round(this.volume * 100);
  }

  readonly increment = (): void => {
    this.count += 1;
  };

  readonly onRefresh = (): void => {
    this.refreshing = true;
    this.changeDetector.detectChanges();
    setTimeout(() => {
      this.refreshing = false;
      this.changeDetector.detectChanges();
    }, REFRESH_MS);
  };

  readonly toggleStatusBarHidden = (): void => {
    const next = !this.statusBarHidden;
    this.statusBarHidden = next;
    StatusBar.setHidden(next, 'fade');
  };

  readonly toggleStatusBarStyle = (): void => {
    const next = !this.darkStatusBar;
    this.darkStatusBar = next;
    StatusBar.setBarStyle(next ? 'dark-content' : 'light-content', true);
  };

  readonly toggleStatusBarRed = (): void => {
    const next = !this.statusBarRed;
    this.statusBarRed = next;
    StatusBar.setBackgroundColor(next ? '#dd0031' : '#111827', true);
  };

  readonly toggleStatusBarTranslucent = (): void => {
    const next = !this.statusBarTranslucent;
    this.statusBarTranslucent = next;
    StatusBar.setTranslucent(next);
  };

  readonly onShare = (): void => {
    void Share.share({
      message: 'Sent from symbiote Angular',
      url: 'https://angular.dev',
    }).catch(() => undefined);
  };

  readonly onAlert = (): void => {
    Alert.alert('symbiote', 'Angular reached the native AlertManager.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Vibrate', onPress: () => Vibration.vibrate() },
    ]);
  };

  readonly onActionSheet = (): void => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Share', 'Vibrate', 'Cancel'], cancelButtonIndex: 2 },
      (index: number) => {
        if (index === 0) this.onShare();
        if (index === 1) Vibration.vibrate();
      },
    );
  };

  readonly onOpenUrl = (): void => {
    void Linking.openURL('https://angular.dev').catch(() => undefined);
  };

  // nativeEvent is a framework-agnostic Record<string, unknown>, so a numeric field
  // (locationX/locationY…) arrives untyped, narrow it here instead of casting.
  private nativeNumber(event: ISymbioteEvent, key: string): number {
    const value = event.nativeEvent[key];
    return typeof value === 'number' ? value : 0;
  }

  readonly onRetentionMove = (event: ISymbioteEvent): void => {
    this.retentionMove = {
      dx: Math.round(this.nativeNumber(event, 'locationX')),
      dy: Math.round(this.nativeNumber(event, 'locationY')),
    };
  };

  // Pressable's `style` is a FUNCTION of press state (RN's own idiom) — Angular's [class]
  // binding only accepts a plain string/array/object, not a callback, so this stays a full
  // JS object rather than splitting a class out (same reasoning as pressableStyle below).
  readonly retentionStyle = ({ pressed }: { pressed: boolean }) => ({
    height: 64,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: pressed ? '#3b0b18' : '#181f33',
  });

  readonly freezeJsScroll = (): void => {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      // Intentionally block the JS thread: no JS frame can run here, so any header motion
      // during the freeze must be coming from the native driver.
    }
  };

  readonly onVibrate = (): void => {
    Vibration.vibrate();
  };

  readonly openModal = (): void => {
    this.modalVisible = true;
  };

  readonly closeModal = (): void => {
    this.modalVisible = false;
  };

  readonly showToast = (): void => {
    this.toastVisible = true;
  };

  readonly dismissToast = (): void => {
    this.toastVisible = false;
  };

  readonly showTunnelToast = (): void => {
    this.tunnelToastVisible = true;
  };

  readonly dismissTunnelToast = (): void => {
    this.tunnelToastVisible = false;
  };

  readonly chipKeyExtractor = (item: IChip): string => item.id;

  readonly chipItemLayout = (
    _data: unknown,
    index: number,
  ): {
    length: number;
    offset: number;
    index: number;
  } => ({
    length: CHIP_WIDTH + CHIP_GAP,
    offset: (CHIP_WIDTH + CHIP_GAP) * index,
    index,
  });

  readonly mvcpKeyExtractor = (item: IMvcpItem): string => item.id;

  readonly chipColor = (item: unknown): string =>
    this.isChip(item) ? item.color : '#dd0031';

  readonly chipIndex = (item: unknown): number | string =>
    this.isChip(item) ? item.index : '?';

  // width / marginRight stay dynamic — they reference the CHIP_WIDTH/CHIP_GAP script consts,
  // which a CSS selector has no way to read (the rest of chip-card's look lives in App.css).
  readonly chipStyle = (item: unknown) => ({
    width: CHIP_WIDTH,
    marginRight: CHIP_GAP,
    backgroundColor: this.chipColor(item),
  });

  readonly mvcpLabel = (item: unknown): string =>
    this.isMvcpItem(item) ? item.label : '';

  readonly prependMvcpItems = (): void => {
    this.mvcpHead -= 5;
    const head = this.mvcpHead;
    const prepended = Array.from({ length: 5 }, (_value, index) => {
      const n = head + index;
      return { id: `row-${n}`, label: `item ${n}` };
    });
    this.mvcpItems = [...prepended, ...this.mvcpItems];
  };

  // Same style-is-a-function reasoning as retentionStyle above — stays a full JS object.
  readonly pressableStyle = ({ pressed }: { pressed: boolean }) => ({
    alignSelf: 'flex-start' as const,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: pressed ? '#3b0b18' : '#181f33',
    borderColor: pressed ? '#ff6b8a' : '#dd0031',
  });

  get platformText(): string {
    return (
      `${Platform.OS} ${Platform.Version}` +
      `${Platform.isPad ? ' · iPad' : ''}` +
      ` · ${Platform.select({ ios: 'native ios', android: 'native android', default: '?' })}` +
      ` · hairline ${StyleSheet.hairlineWidth.toFixed(3)}`
    );
  }

  get dimensionsText(): string {
    const window = this.windowDimensions();
    return (
      `${Math.round(window.width)}×${Math.round(window.height)} @${PixelRatio.get()}x` +
      ` · ${this.colorScheme() ?? 'no-scheme'} · ${this.appState}`
    );
  }

  ngOnInit(): void {
    hide();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(subscription => subscription.remove());
  }

  private isChip(item: unknown): item is IChip {
    return (
      typeof item === 'object' &&
      item !== null &&
      'color' in item &&
      typeof item.color === 'string' &&
      'index' in item &&
      typeof item.index === 'number'
    );
  }

  private isMvcpItem(item: unknown): item is IMvcpItem {
    return (
      typeof item === 'object' &&
      item !== null &&
      'label' in item &&
      typeof item.label === 'string'
    );
  }

  private readonly handleKeyboardShow = (payload: unknown): void => {
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
    this.keyboardHeight = height;
  };

  private readonly handleKeyboardHide = (): void => {
    this.keyboardHeight = 0;
  };

  private readonly handleAppStateChange = (...args: unknown[]): void => {
    const next = args[0];
    if (typeof next === 'string') this.appState = next;
  };

  private readonly subscriptions: Array<{ remove(): void }> = [
    Keyboard.addListener(KEYBOARD_EVENT.didShow, this.handleKeyboardShow),
    Keyboard.addListener(KEYBOARD_EVENT.didHide, this.handleKeyboardHide),
    AppState.addEventListener('change', this.handleAppStateChange),
  ];
}
