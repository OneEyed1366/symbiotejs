import { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, I18nManager, Settings } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';

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

export function NativeModulesDemo() {
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
    <View className="section-nested">
      <Text className="section-label">
        Runtime modules · I18nManager / Settings / Image statics
      </Text>

      {/* I18nManager: RTL layout constants, read live */}
      <Text className="info-text">
        {`RTL: ${rtl.isRTL ? 'on' : 'off'} · swap L/R: ${rtl.doLeftAndRightSwapInRTL ? 'yes' : 'no'}`}
      </Text>
      <ActionButton
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
      <ActionButton
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
      <ActionButton title="Prefetch logo" onPress={prefetchLogo} color="#7fb5ff" />
    </View>
  );
}
