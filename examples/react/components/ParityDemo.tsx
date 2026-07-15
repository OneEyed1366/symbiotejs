import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  SectionList,
  Keyboard,
  AccessibilityInfo,
  type IHostInstance,
  type IFlatListHandle,
  type ISection,
} from '@symbiote-native/react';
import { ActionButton } from './ActionButton';

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

export function ParityDemo() {
  const listRef = useRef<IFlatListHandle>(null);
  const titleRef = useRef<IHostInstance>(null);
  const [longPressMsg, setLongPressMsg] = useState(
    'long-press or tap the row below',
  );
  const [dismissMsg, setDismissMsg] = useState(
    'focus the field, then Hide keyboard',
  );

  return (
    <View className="section-nested">
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
      <ActionButton
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
          <ActionButton
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
          <ActionButton
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
      <ActionButton
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
