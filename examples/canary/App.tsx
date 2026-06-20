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

import { useCallback, useState } from 'react'
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
} from '@symbiote/react'

const CHIP_WIDTH = 72
const CHIP_GAP = 12
const REFRESH_MS = 1200

const chips = Array.from({ length: 24 }, (_, index) => ({
  id: `chip-${index}`,
  index,
  color: `hsl(${(index * 37) % 360} 70% 55%)`,
}))

function App() {
  const [count, setCount] = useState(0)
  const [name, setName] = useState('')
  const [spinning, setSpinning] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshes, setRefreshes] = useState(0)

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => {
      setRefreshing(false)
      setRefreshes(value => value + 1)
    }, REFRESH_MS)
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
      <Text style={{ color: '#7fb5ff', fontSize: 16, textAlign: 'center' }}>
        symbiote · all primitives
      </Text>
      <Text style={{ color: '#41506a', fontSize: 13, textAlign: 'center' }}>
        {`pull to refresh · refreshed ${refreshes}×`}
      </Text>

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
