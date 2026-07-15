import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import {
  Button,
  I18nManager,
  Image,
  Settings,
  Text,
  View,
} from '@symbiote-native/angular';
// Static look lives in NativeModulesDemo.css — compiled at build time by
// @symbiote-native/css-parser and resolved at runtime through the shared style registry.
import './NativeModulesDemo.css';

// Reuses the same Angular logo the canary already renders (see ANGULAR_LOGO_URI
// in App.ts) rather than inventing a new asset.
const LOGO_URI = 'https://angular.io/assets/images/logos/angular/angular.png';
// A distinct cache key for the prefetch demo: same asset, different URL (query
// string), so nothing has loaded it yet. The cache starts cold and the button
// visibly warms it, unlike LOGO_URI, which getSize + the <Image> already pulled in.
const PREFETCH_URI = LOGO_URI + '?warm=symbiote';
const TAP_KEY = 'symbiote.tapCount';

@Component({
  selector: 'NativeModulesDemo',
  standalone: true,
  imports: [View, Text, Button, Image],
  template: `
    <View class="section">
      <Text class="section-label"
        >Runtime modules · I18nManager / Settings / Image statics</Text
      >
      <Text testID="rtl-status" class="info-text">{{
        'RTL: ' +
          (rtl.isRTL ? 'on' : 'off') +
          ' · swap L/R: ' +
          (rtl.doLeftAndRightSwapInRTL ? 'yes' : 'no')
      }}</Text>
      <Button
        testID="force-rtl-btn"
        [title]="
          rtl.isRTL ? 'Force LTR (needs reload)' : 'Force RTL (needs reload)'
        "
        (press)="onForceRtl()"
        color="#dd0031"
      ></Button>

      <Text testID="persist-count" class="info-text"
        >{{ 'persisted taps: ' + persisted + ' · survives relaunch' }}</Text
      >
      <Button
        testID="persist-btn"
        title="Persist a tap"
        (press)="persistTap()"
        color="#dd0031"
      ></Button>

      <View class="row-align-center">
        <Image [source]="{ uri: LOGO_URI }" class="logo-thumb" />
        <Text testID="logo-size" class="info-text-flex"
          >{{ 'logo size: ' + imageSize }}</Text
        >
      </View>
      <Text testID="cache-state" class="info-text">{{
        'prefetch cache: ' + cacheState
      }}</Text>
      <Button
        testID="prefetch-btn"
        title="Prefetch logo"
        (press)="prefetchLogo()"
        color="#dd0031"
      ></Button>
    </View>
  `,
})
export class NativeModulesDemo implements OnInit, OnDestroy {
  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly LOGO_URI = LOGO_URI;

  // I18nManager: RTL constants, read once at construction. A non-throwing read
  // proves the module name resolved; synchronous, so no change-detection kick needed.
  readonly rtl = I18nManager.getConstants();

  // Settings: a counter persisted to NSUserDefaults, read back on init, bumped +
  // resaved on tap, and watched so an external write to the key reflects live.
  // Survives a relaunch.
  persisted = (() => {
    const stored = Settings.get(TAP_KEY);
    return typeof stored === 'number' ? stored : 0;
  })();

  // Image statics: getSize resolves the rendered logo's real pixel dimensions.
  imageSize = 'measuring…';

  // Prefetch on a COLD url nothing has loaded yet.
  cacheState = 'checking…';

  private watchId?: number;

  ngOnInit(): void {
    this.watchId = Settings.watchKeys(TAP_KEY, () => {
      const stored = Settings.get(TAP_KEY);
      if (typeof stored === 'number') {
        this.persisted = stored;
        this.changeDetector.detectChanges();
      }
    });

    Image.getSize(LOGO_URI)
      .then(({ width, height }) => {
        this.imageSize = `${width}×${height}px`;
        this.changeDetector.detectChanges();
      })
      .catch(() => {
        this.imageSize = 'unavailable';
        this.changeDetector.detectChanges();
      });

    this.refreshCache();
  }

  ngOnDestroy(): void {
    if (this.watchId !== undefined) Settings.clearWatch(this.watchId);
  }

  readonly onForceRtl = (): void => {
    I18nManager.forceRTL(!this.rtl.isRTL);
  };

  readonly persistTap = (): void => {
    const next = this.persisted + 1;
    Settings.set({ [TAP_KEY]: next });
    this.persisted = next;
  };

  readonly prefetchLogo = (): void => {
    this.cacheState = 'prefetching…';
    void Image.prefetch(PREFETCH_URI)
      .then(() => this.refreshCache())
      .catch(() => {
        this.cacheState = 'unavailable';
        this.changeDetector.detectChanges();
      });
  };

  private refreshCache(): void {
    Image.queryCache([PREFETCH_URI])
      .then(cache => {
        this.cacheState = cache[PREFETCH_URI] ?? 'not cached';
        this.changeDetector.detectChanges();
      })
      .catch(() => {
        this.cacheState = 'unavailable';
        this.changeDetector.detectChanges();
      });
  }
}
