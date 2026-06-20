/**
 * Symbiote canary app. Every primitive here — View, Text, ScrollView, TextInput,
 * Image — comes from @symbiote/react, not react-native. The tree is rendered by
 * our own react-reconciler host config straight onto Fabric; React Native's
 * renderer is never involved. Run with DEBUG=1 to watch each interaction commit
 * incrementally (created=0, only the touched branch clones) in the Metro logs.
 *
 * @format
 */

import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Image } from '@symbiote/react';

function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0b1622' }}
      contentContainerStyle={{
        paddingVertical: 64,
        paddingHorizontal: 24,
        alignItems: 'center',
        gap: 160,
      }}>
      <Text style={{ color: '#7fb5ff', fontSize: 16 }}>symbiote · all primitives</Text>

      <View
        onPress={() => setCount(value => value + 1)}
        style={{
          paddingHorizontal: 32,
          paddingVertical: 20,
          borderRadius: 16,
          backgroundColor: '#2b6cb0',
        }}>
        <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: 'bold' }}>
          {`tapped ${count}×`}
        </Text>
      </View>

      <Text style={{ color: '#7fb5ff', fontSize: 14 }}>type your name:</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="name…"
        placeholderTextColor="#41506a"
        style={{
          width: 240,
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
      <Text style={{ color: '#ffffff', fontSize: 20 }}>
        {name ? `Hello, ${name}` : 'Hello, stranger'}
      </Text>

      <Image
        source={{ uri: 'https://reactnative.dev/img/tiny_logo.png' }}
        style={{ width: 64, height: 64, borderRadius: 12 }}
      />

      <View
        style={{
          height: 240,
          alignSelf: 'stretch',
          borderRadius: 16,
          backgroundColor: '#13243a',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ color: '#7fb5ff', fontSize: 16 }}>↑ you scrolled to the bottom</Text>
      </View>
    </ScrollView>
  );
}

export default App;
