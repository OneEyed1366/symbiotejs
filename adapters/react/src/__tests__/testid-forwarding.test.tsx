// testID must reach the committed native node for EVERY public component — it is the seam Detox
// and other e2e tools match on. A component that drops testID (e.g. by destructuring it off and
// never forwarding) is invisible to e2e. This is the cross-component guard: render each component
// with a unique testID and assert some committed Fabric node carries it. A wrapping component
// (Button -> TouchableOpacity -> Pressable -> View) passes as long as the id lands on its root.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  View,
  Text,
  Image,
  ImageBackground,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Button,
  Pressable,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  SafeAreaView,
  Modal,
  KeyboardAvoidingView,
  InputAccessoryView,
  FlatList,
  SectionList,
  VirtualizedList,
  Animated,
} from '@symbiote/react';
import { installFabric, type IFakeNode } from '@symbiote/test-utils';

// KeyboardAvoidingView subscribes to the native Keyboard hub on mount; install the minimal fake
// device-event hub + KeyboardObserver the dedicated keyboard tests use so it mounts headless.
// (Harness setup, not part of the testID contract.)
const fakeKeyboardObserver = { addListener: (): void => {}, removeListeners: (): void => {} };
const fakeModules: Record<string, unknown> = { KeyboardObserver: fakeKeyboardObserver };
Object.assign(globalThis, {
  __turboModuleProxy: (name: string): unknown => fakeModules[name] ?? null,
  RN$registerCallableModule: (): void => {},
});

const ROOT_TAG = 770;
const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function carriesTestId(id: string): IFakeNode | undefined {
  return fabric.find(node => node.props.testID === id);
}

// name -> a factory building the element with `testID` set (+ whatever minimal props it needs).
const cases: ReadonlyArray<readonly [string, (id: string) => ReactElement]> = [
  ['View', id => createElement(View, { testID: id })],
  ['Text', id => createElement(Text, { testID: id }, 'x')],
  ['Image', id => createElement(Image, { testID: id, source: { uri: 'x' } })],
  [
    'ImageBackground',
    id =>
      createElement(
        ImageBackground,
        { testID: id, source: { uri: 'x' } },
        createElement(Text, {}, 'x'),
      ),
  ],
  ['ScrollView', id => createElement(ScrollView, { testID: id }, createElement(Text, {}, 'x'))],
  ['TextInput', id => createElement(TextInput, { testID: id })],
  ['Switch', id => createElement(Switch, { testID: id, value: false })],
  ['ActivityIndicator', id => createElement(ActivityIndicator, { testID: id })],
  ['Button', id => createElement(Button, { testID: id, title: 'x' })],
  ['Pressable', id => createElement(Pressable, { testID: id }, createElement(Text, {}, 'x'))],
  [
    'TouchableOpacity',
    id => createElement(TouchableOpacity, { testID: id }, createElement(Text, {}, 'x')),
  ],
  [
    'TouchableHighlight',
    id => createElement(TouchableHighlight, { testID: id }, createElement(Text, {}, 'x')),
  ],
  [
    'TouchableWithoutFeedback',
    id => createElement(TouchableWithoutFeedback, { testID: id }, createElement(View, {})),
  ],
  ['SafeAreaView', id => createElement(SafeAreaView, { testID: id }, createElement(Text, {}, 'x'))],
  [
    'KeyboardAvoidingView',
    id => createElement(KeyboardAvoidingView, { testID: id }, createElement(Text, {}, 'x')),
  ],
  [
    'Modal',
    id => createElement(Modal, { testID: id, visible: true }, createElement(Text, {}, 'x')),
  ],
  [
    'InputAccessoryView',
    id =>
      createElement(
        InputAccessoryView,
        { testID: id, nativeID: 'acc' },
        createElement(Text, {}, 'x'),
      ),
  ],
  [
    'FlatList',
    id =>
      createElement(FlatList, {
        testID: id,
        data: [1],
        renderItem: (info: { item: unknown }) => createElement(Text, {}, String(info.item)),
      }),
  ],
  [
    'SectionList',
    id =>
      createElement(SectionList, {
        testID: id,
        sections: [{ title: 's', data: [1] }],
        renderItem: (info: { item: unknown }) => createElement(Text, {}, String(info.item)),
      }),
  ],
  [
    'VirtualizedList',
    id =>
      createElement(VirtualizedList, {
        testID: id,
        data: [1],
        getItem: (data: unknown, index: number) => (Array.isArray(data) ? data[index] : undefined),
        getItemCount: (data: unknown) => (Array.isArray(data) ? data.length : 0),
        renderItem: (info: { item: unknown }) => createElement(Text, {}, String(info.item)),
      }),
  ],
  ['Animated.View', id => createElement(Animated.View, { testID: id })],
  ['Animated.Text', id => createElement(Animated.Text, { testID: id }, 'x')],
];

describe('testID reaches the committed native node for every component', () => {
  for (const [name, build] of cases) {
    it(`${name} forwards testID to Fabric`, () => {
      const id = `tid-${name}`;
      mount(ROOT_TAG, build(id));
      expect(carriesTestId(id)).toBeDefined();
    });
  }
});
