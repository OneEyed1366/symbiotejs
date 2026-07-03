// testID must reach the committed native node for EVERY public Vue component — it is the seam Detox
// matches on, and the Vue path adds risk the React path lacks: attrs arrive untyped and run through
// normalizeVueAttrs, and a component's forwardAttrs allow-list could drop testID. This is the Vue
// twin of the React testid-forwarding guard: render each component with a unique testID and assert
// some committed Fabric node carries it (a wrapper like Button -> TouchableOpacity passes as long as
// the id lands on its root).

import { defineComponent, h, type VNode } from '@vue/runtime-core';
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
} from '@symbiotejs/vue';
import { installFabric, type IFakeNode } from '@symbiotejs/test-utils';

// KeyboardAvoidingView subscribes to the native Keyboard hub in onMounted; without a device-event
// hub that throws before the commit, so install the minimal fake hub + KeyboardObserver the
// dedicated keyboard tests use. (This is harness setup, not part of the testID contract.)
const fakeKeyboardObserver = { addListener: (): void => {}, removeListeners: (): void => {} };
const fakeModules: Record<string, unknown> = { KeyboardObserver: fakeKeyboardObserver };
Object.assign(globalThis, {
  __turboModuleProxy: (name: string): unknown => fakeModules[name] ?? null,
  RN$registerCallableModule: (): void => {},
});

const ROOT_TAG = 780;
const fabric = installFabric();

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function carriesTestId(id: string): IFakeNode | undefined {
  return fabric.find(node => node.props.testID === id);
}

const textChild = (): VNode[] => [h(Text, null, 'x')];

// name -> a factory building the VNode with `testID` set (+ whatever minimal props it needs).
const cases: ReadonlyArray<readonly [string, (id: string) => VNode]> = [
  ['View', id => h(View, { testID: id })],
  ['Text', id => h(Text, { testID: id }, 'x')],
  ['Image', id => h(Image, { testID: id, source: { uri: 'x' } })],
  ['ImageBackground', id => h(ImageBackground, { testID: id, source: { uri: 'x' } }, textChild)],
  ['ScrollView', id => h(ScrollView, { testID: id }, textChild)],
  ['TextInput', id => h(TextInput, { testID: id })],
  ['Switch', id => h(Switch, { testID: id, value: false })],
  ['ActivityIndicator', id => h(ActivityIndicator, { testID: id })],
  ['Button', id => h(Button, { testID: id, title: 'x' })],
  ['Pressable', id => h(Pressable, { testID: id }, textChild)],
  ['TouchableOpacity', id => h(TouchableOpacity, { testID: id }, textChild)],
  ['TouchableHighlight', id => h(TouchableHighlight, { testID: id }, textChild)],
  ['TouchableWithoutFeedback', id => h(TouchableWithoutFeedback, { testID: id }, () => [h(View)])],
  ['SafeAreaView', id => h(SafeAreaView, { testID: id }, textChild)],
  ['KeyboardAvoidingView', id => h(KeyboardAvoidingView, { testID: id }, textChild)],
  ['Modal', id => h(Modal, { testID: id, visible: true }, textChild)],
  ['InputAccessoryView', id => h(InputAccessoryView, { testID: id, nativeID: 'acc' }, textChild)],
  [
    'FlatList',
    id =>
      h(FlatList, {
        testID: id,
        data: [1],
        renderItem: (info: { item: unknown }) => h(Text, null, String(info.item)),
      }),
  ],
  [
    'SectionList',
    id =>
      h(SectionList, {
        testID: id,
        sections: [{ title: 's', data: [1] }],
        renderItem: (info: { item: unknown }) => h(Text, null, String(info.item)),
      }),
  ],
  [
    'VirtualizedList',
    id =>
      h(VirtualizedList, {
        testID: id,
        data: [1],
        getItem: (data: unknown, index: number) => (Array.isArray(data) ? data[index] : undefined),
        getItemCount: (data: unknown) => (Array.isArray(data) ? data.length : 0),
        renderItem: (info: { item: unknown }) => h(Text, null, String(info.item)),
      }),
  ],
  ['Animated.View', id => h(Animated.View, { testID: id })],
  ['Animated.Text', id => h(Animated.Text, { testID: id }, 'x')],
];

describe('testID reaches the committed native node for every Vue component', () => {
  for (const [name, build] of cases) {
    it(`${name} forwards testID to Fabric`, async () => {
      const id = `tid-${name}`;
      mount(ROOT_TAG, defineComponent({ setup: () => () => build(id) }));
      await tick();
      expect(carriesTestId(id)).toBeDefined();
    });
  }
});
