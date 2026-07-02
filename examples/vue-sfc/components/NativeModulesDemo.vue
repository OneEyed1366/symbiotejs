<!--
  Three runtime modules, each read live so it only resolves on a real host: I18nManager
  (RTL layout constants), Settings (a value round-tripped through iOS NSUserDefaults via
  SettingsManager), and Image's static methods (getSize / queryCache / prefetch, which hit
  the ImageLoader native module).
-->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { View, Text, Image, Button, I18nManager, Settings } from '@symbiote/vue'

const LOGO_URI = 'https://vuejs.org/images/logo.png'
// A distinct cache key for the prefetch demo: same asset, different URL (query
// string), so nothing has loaded it yet. The cache starts cold and the button
// visibly warms it, unlike LOGO_URI, which getSize + the <Image> already pulled in.
const PREFETCH_URI = 'https://vuejs.org/images/logo.png?warm=symbiote'
const TAP_KEY = 'symbiote.tapCount'

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
</script>

<template>
  <View class="section">
    <Text class="section-label">Runtime modules · I18nManager / Settings / Image statics</Text>

    <!-- I18nManager: RTL layout constants, read live -->
    <Text class="info-text">{{ `RTL: ${rtl.isRTL ? 'on' : 'off'} · swap L/R: ${rtl.doLeftAndRightSwapInRTL ? 'yes' : 'no'}` }}</Text>
    <Button
      testID="force-rtl-btn"
      :title="rtl.isRTL ? 'Force LTR (needs reload)' : 'Force RTL (needs reload)'"
      @press="() => I18nManager.forceRTL(!rtl.isRTL)"
      color="#42b883"
    />

    <!-- Settings: counter persisted to NSUserDefaults, survives a relaunch -->
    <Text testID="persist-count" class="info-text">{{ `persisted taps: ${persisted} · survives relaunch` }}</Text>
    <Button testID="persist-btn" title="Persist a tap" @press="persistTap" color="#42b883" />

    <!-- Image statics: the rendered asset + getSize's measurement of it -->
    <View class="row-align-center">
      <Image :source="{ uri: LOGO_URI }" class="logo-thumb" />
      <Text testID="logo-size" class="info-text-flex">{{ `logo size: ${imageSize}` }}</Text>
    </View>
    <!-- prefetch warms a cold url: not cached → (tap) → cached -->
    <Text testID="prefetch-cache-status" class="info-text">{{ `prefetch cache: ${cacheState}` }}</Text>
    <Button testID="prefetch-btn" title="Prefetch logo" @press="prefetchLogo" color="#42b883" />
  </View>
</template>

<style scoped>
.section {
  gap: 12px;
}
.section-label {
  color: #3b5266;
  font-size: 13px;
}
.info-text {
  color: #cbd5e1;
  font-size: 14px;
}
.row-align-center {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}
.logo-thumb {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background-color: #22323f;
}
.info-text-flex {
  color: #cbd5e1;
  font-size: 14px;
  flex: 1;
}
</style>
