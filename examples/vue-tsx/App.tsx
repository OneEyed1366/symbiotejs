// The Vue canary, authored in Vue JSX (.tsx). @vue/babel-plugin-jsx compiles the JSX in
// setup()'s render fn to @vue/runtime-core createVNode calls (Metro aliases 'vue' →
// @vue/runtime-core), so every vnode still recommits through @symbiote/engine into Fabric,
// with React Native's renderer never in the path (M3 / R4). Same engine, same components, same
// palette as the SFC canary (examples/vue-sfc); only the authoring differs; the proof the
// Vue slice is template-agnostic.
//
// Mirrors the TOP slice of examples/react/App.tsx (the ориентир): a SafeAreaView → ScrollView
// (with a pull-to-refresh RefreshControl) wrapping the content: View · Text · Switch ·
// ActivityIndicator. Beyond static paint it exercises the same control flow React's canary does:
// CONDITIONAL render (a ternary: spinner vs a muted label) and ITERATION (&& empty-state + a
// keyed .map over a tap log). The ONLY visual difference between the three examples is the badge
// line naming which one is rendering.

import { defineComponent, ref, onMounted } from 'vue'
import { View, Text, Image, ActivityIndicator, Switch, ScrollView, RefreshControl, SafeAreaView, StyleSheet } from '@symbiote/vue'

type ILogEntry = { id: number; label: string }

const REFRESH_MS = 2000
const LOGO_URI = 'https://vuejs.org/images/logo.png'

export default defineComponent({
  name: 'App',
  setup() {
    const taps = ref(0)
    const spinning = ref(true)
    const log = ref<ILogEntry[]>([])
    const refreshing = ref(false)
    const refreshes = ref(0)
    let nextId = 0

    function onTap() {
      taps.value += 1
      // newest on top → unshift inserts BEFORE existing rows (keyed-insert path); cap at 5
      // pops the oldest, so each tap exercises keyed insert + remove in the reconciler.
      log.value.unshift({ id: nextId++, label: `tap #${taps.value}` })
      if (log.value.length > 5) log.value.pop()
    }

    function onRefresh() {
      refreshing.value = true
      setTimeout(() => {
        refreshing.value = false
        refreshes.value += 1
      }, REFRESH_MS)
    }

    // Image statics parity (examples/react/App.tsx): getSize resolves the rendered logo's real pixel
    // dimensions through the ImageLoader native module, the same asset the <Image> below paints.
    const imageSize = ref('measuring…')
    onMounted(() => {
      Image.getSize(LOGO_URI)
        .then(({ width, height }) => { imageSize.value = `${width}×${height}px` })
        .catch(() => { imageSize.value = 'unavailable' })
    })

    return () => (
      <SafeAreaView style={styles.screen}>
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing.value} onRefresh={onRefresh} tintColor="#7fb5ff" />}
        >
          <Text style={styles.badge}>◆ RENDERED FROM .TSX (Vue JSX)</Text>
          <Text style={styles.title}>symbiote · all primitives</Text>
          <Text style={styles.refreshNote}>pull to refresh · refreshed {refreshes.value}×</Text>

          {/* View + press-to-increment (raw responder protocol) */}
          <View style={styles.counterCard} onStartShouldSetResponder={() => true} onResponderRelease={onTap}>
            <Text style={styles.counterText}>tapped {taps.value}×</Text>
          </View>

          {/* Switch drives the ActivityIndicator (examples/react/App.tsx ориентир) */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>spinner</Text>
            <Switch
              value={spinning.value}
              onValueChange={(next: boolean) => {
                spinning.value = next
              }}
              trackColor={{ false: '#334155', true: '#2b6cb0' }}
            />
          </View>

          {/* conditional render: spinner while on, a muted label while off */}
          {spinning.value ? (
            <ActivityIndicator animating={spinning.value} size="large" color="#7fb5ff" />
          ) : (
            <Text style={styles.paused}>paused</Text>
          )}

          {/* iteration + empty-state: keyed .map over the tap log, newest first */}
          <View style={styles.logSection}>
            <Text style={styles.sectionLabel}>tap log · newest first</Text>
            {log.value.length === 0 && <Text style={styles.emptyHint}>tap the card to log</Text>}
            {log.value.map((entry: ILogEntry) => (
              <Text key={entry.id} style={styles.logRow}>
                {entry.label}
              </Text>
            ))}
          </View>

          {/* Image: native source array (require/uri) + getSize statics; the web-alias src/alt fold */}
          <View style={styles.imageSection}>
            <Text style={styles.sectionLabel}>image · source + statics</Text>
            <View style={styles.rowAlignCenter}>
              <Image source={{ uri: LOGO_URI }} style={styles.logoThumb} />
              <Text style={styles.imageCaption}>logo size: {imageSize.value}</Text>
            </View>
            <Image src="https://vuejs.org/images/logo.png" alt="Vue logo" width={48} height={48} style={styles.webImage} />
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  },
})

// Static styles, grouped in one StyleSheet.create at the bottom, same convention and palette
// as examples/react/App.tsx. Referenced from the render fn above (runs after module init, so a
// below-component const is TDZ-safe).
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1622' },
  scrollContent: { paddingVertical: 64, paddingHorizontal: 24, gap: 28, alignItems: 'stretch' },
  badge: { color: '#60a5fa', fontSize: 14, letterSpacing: 2, textAlign: 'center' },
  title: { color: '#7fb5ff', fontSize: 16, textAlign: 'center' },
  refreshNote: { color: '#41506a', fontSize: 13, textAlign: 'center' },
  counterCard: { paddingVertical: 18, borderRadius: 16, backgroundColor: '#2b6cb0', alignItems: 'center' },
  counterText: { color: '#ffffff', fontSize: 24, fontWeight: 'bold' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  switchLabel: { color: '#cbd5e1', fontSize: 16 },
  paused: { color: '#41506a', fontSize: 14, textAlign: 'center' },
  logSection: { gap: 6 },
  sectionLabel: { color: '#41506a', fontSize: 13 },
  emptyHint: { color: '#41506a', fontSize: 13 },
  logRow: { color: '#cbd5e1', fontSize: 15 },
})
