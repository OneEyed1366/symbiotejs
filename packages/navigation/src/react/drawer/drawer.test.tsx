// Co-located React-driven test (ADR 0025) for the @symbiote-native/navigation React Drawer.
// Unlike Stack (real native RNSScreen views) and Tab (a pure-JS tab bar), Drawer additionally
// drives a real PanResponder + Animated.timing gesture, so this file borrows the fake-touch-event
// technique from pan-responder-multitouch.test.tsx (topTouchStart/topTouchMove/topTouchEnd with
// pageX/identifier/target) to prove an edge-swipe actually opens/closes the drawer, plus the rAF
// polyfill from animated-integration.test.tsx (every openDrawer/closeDrawer/toggleDrawer call and
// a gesture release schedules a real requestAnimationFrame via Animated.timing, which is not a
// Node global). Drawer is imported from './drawer' (NOT the package barrel) so the third-party
// native-spec side-effect (../register) never loads headless - matching stack.test.tsx/
// tabs.test.tsx, even though Drawer itself needs no injected ViewConfig (PanResponder + Animated
// are pure JS, like Tab's bar).

import { act, createElement, createRef, useCallback } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Dimensions } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Drawer } from './index';
import type { IDrawerNavigatorHandle } from './index';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '../hooks';

const ROOT_TAG = 704;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';
const TOUCH_ID = 1;

// Drawer reads the screen width off useWindowDimensions() to resolve the swipe edge zone
// (isSwipeStartInEdge) - headless has no DeviceInfo native module, so seed a concrete width once;
// every mount in this file reads this same cached value (Dimensions is a module-level singleton).
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

// rAF is not a Node global; Animated.timing (driven by every openDrawer/closeDrawer/toggleDrawer
// call and by a gesture release) reads it at .start() time. Ported verbatim from
// animated-integration.test.tsx's setTimeout-based polyfill - no frame is ever awaited here since
// these tests assert on state.isOpen-derived props, not the animated frame values.
let frameClock = 0;
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const cb = pendingFrames.get(id);
        if (cb !== undefined) {
          pendingFrames.delete(id);
          frameClock += 16;
          cb(frameClock);
        }
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  pendingFrames.clear();
  nextFrameId = 1;
  installRequestAnimationFrame();
});
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

function HomeScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'home');
}
function ProfileScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'profile');
}

function findAllText(nodes: readonly IFakeNode[]): string[] {
  const found: string[] = [];
  const collect = (list: readonly IFakeNode[]): void => {
    for (const node of list) {
      if (node.viewName === 'RCTRawText' && typeof node.props.text === 'string') {
        found.push(node.props.text);
      }
      collect(node.children);
    }
  };
  collect(nodes);
  return found;
}

// Drawer's own root view (holds panResponder.panHandlers) - first child under the AppContainer,
// mirroring pan-responder-multitouch.test.tsx's `viewNode`.
function drawerRoot(): IFakeNode {
  return fabric.appRoot().children[0];
}

// Default drawerType ('front') paints [content, overlay, panel] in that sibling order
// (render-drawer.ts's drawerChildOrder) - the overlay's pointerEvents prop ('auto' while open,
// 'none' while closed) is the one stable, non-animated signal of state.isOpen this file reads,
// since the slide/opacity transforms themselves are driven by a real (unawaited) Animated.timing.
function overlayNode(): IFakeNode {
  const overlay = drawerRoot().children[1];
  if (!overlay) throw new Error('no overlay child committed');
  return overlay;
}

function isOpenByOverlay(): boolean {
  return overlayNode().props.pointerEvents === 'auto';
}

type ITouchFrame = { x: number; y: number; t: number };

// Fires a start -> N moves -> end sequence at the drawer root, mirroring the fake-Fabric touch
// technique from pan-responder-multitouch.test.tsx (touches carry their own `target`, matching
// how the engine resolves touch ancestry - plain {identifier,pageX,pageY} like tabs.test.tsx's
// simple tap is not enough for a multi-frame drag). Wrapped in one `act()` (tabs.test.tsx's
// tapItem convention) since a release can dispatch a router action and re-render.
function swipe(path: readonly ITouchFrame[]): void {
  const node = drawerRoot();
  const handle = node.instanceHandle;
  const tag = node.tag;
  const point = (frame: ITouchFrame) => ({
    identifier: TOUCH_ID,
    pageX: frame.x,
    pageY: frame.y,
    timestamp: frame.t,
    target: handle,
  });
  const fire = (type: string, frame: ITouchFrame): void => {
    const touch = point(frame);
    fabric.fireEvent(handle, type, {
      touches: type === TOUCH_END ? [] : [touch],
      changedTouches: [touch],
      target: tag,
      timestamp: frame.t,
    });
  };
  act(() => {
    const [start, ...rest] = path;
    fire(TOUCH_START, start);
    rest.forEach((frame, i) => fire(i === rest.length - 1 ? TOUCH_END : TOUCH_MOVE, frame));
  });
}

// Clears the default swipeEdgeWidth (32) and swipeMinDistance (60) at position 'left' - a start
// near x=10 followed by a large horizontal move.
const OPEN_SWIPE: readonly ITouchFrame[] = [
  { x: 10, y: 400, t: 1_000 },
  { x: 130, y: 400, t: 1_050 }, // dx=120 (>=60), dt=50 -> vx=2.4 (>=0.5): both thresholds clear.
  { x: 130, y: 400, t: 1_060 },
];

// Same edge start, but the move never clears either threshold: dx=20 (<60), dt=100 -> vx=0.2
// (<0.5).
const UNDER_THRESHOLD_SWIPE: readonly ITouchFrame[] = [
  { x: 10, y: 400, t: 1_000 },
  { x: 30, y: 400, t: 1_100 },
  { x: 30, y: 400, t: 1_110 },
];

// Same dx/dt as OPEN_SWIPE (clears both thresholds), but starting well past swipeEdgeWidth (32)
// on a 375-wide screen: regression for the bug where onStartShouldSetPanResponder read the
// always-zero gestureState.x0 instead of the touch's real start, which made isSwipeStartInEdge
// pass no matter where a left drawer's swipe began.
const MID_SCREEN_SWIPE: readonly ITouchFrame[] = [
  { x: 180, y: 400, t: 1_000 },
  { x: 300, y: 400, t: 1_050 },
  { x: 300, y: 400, t: 1_060 },
];

// Starts inside the RIGHT edge zone (screenWidth 375 - swipeEdgeWidth 32 = 343) and drags
// leftward -- the 'open' direction for drawerPosition: 'right' (resolveSwipeIntent flips sign).
// Same |dx|=120/dt=50 magnitude as OPEN_SWIPE, mirrored: regression for the same bug's inverse
// symptom, where a right drawer's edge-swipe-to-open was entirely non-functional.
const RIGHT_EDGE_OPEN_SWIPE: readonly ITouchFrame[] = [
  { x: 360, y: 400, t: 1_000 },
  { x: 240, y: 400, t: 1_050 },
  { x: 240, y: 400, t: 1_060 },
];

describe('React Drawer navigator', () => {
  it("mounts only the focused route's content, drawer closed", () => {
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    expect(findAllText(fabric.committed)).toContain('home');
    expect(findAllText(fabric.committed)).not.toContain('profile');
    expect(isOpenByOverlay()).toBe(false);
  });

  it('openDrawer() opens the drawer', () => {
    const ref = createRef<IDrawerNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { ref, initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    act(() => ref.current?.openDrawer());
    expect(isOpenByOverlay()).toBe(true);
  });

  it('closeDrawer() closes an open drawer', () => {
    const ref = createRef<IDrawerNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { ref, initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    act(() => ref.current?.openDrawer());
    act(() => ref.current?.closeDrawer());
    expect(isOpenByOverlay()).toBe(false);
  });

  it('toggleDrawer() flips open/closed across two calls', () => {
    const ref = createRef<IDrawerNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { ref, initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    act(() => ref.current?.toggleDrawer());
    expect(isOpenByOverlay()).toBe(true);
    act(() => ref.current?.toggleDrawer());
    expect(isOpenByOverlay()).toBe(false);
  });

  it('jumpTo() switches the focused screen content while closed', () => {
    const ref = createRef<IDrawerNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { ref, initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    act(() => ref.current?.jumpTo('Profile'));
    expect(findAllText(fabric.committed)).toContain('profile');
    expect(findAllText(fabric.committed)).not.toContain('home');
  });

  it('jumpTo() to an unknown route name is a no-op', () => {
    const ref = createRef<IDrawerNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { ref, initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    act(() => ref.current?.jumpTo('Nowhere'));
    expect(findAllText(fabric.committed)).toContain('home');
  });

  it('jumpTo() closes an already-open drawer', () => {
    const ref = createRef<IDrawerNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { ref, initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    act(() => ref.current?.openDrawer());
    expect(isOpenByOverlay()).toBe(true);
    act(() => ref.current?.jumpTo('Profile'));
    expect(isOpenByOverlay()).toBe(false);
    expect(findAllText(fabric.committed)).toContain('profile');
  });

  it('a valid edge-swipe opens the drawer', () => {
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    expect(isOpenByOverlay()).toBe(false);
    swipe(OPEN_SWIPE);
    expect(isOpenByOverlay()).toBe(true);
  });

  it('a swipe that clears neither the distance nor velocity threshold snaps back closed', () => {
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    swipe(UNDER_THRESHOLD_SWIPE);
    expect(isOpenByOverlay()).toBe(false);
  });

  it('swipeEnabled: false suppresses the gesture entirely', () => {
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { initialRouteName: 'Home', swipeEnabled: false },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    // Same geometry as the passing OPEN_SWIPE case above - the only variable is swipeEnabled.
    swipe(OPEN_SWIPE);
    expect(isOpenByOverlay()).toBe(false);
  });

  it('a swipe starting outside the edge zone does not open a left-positioned drawer', () => {
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    swipe(MID_SCREEN_SWIPE);
    expect(isOpenByOverlay()).toBe(false);
  });

  it('a valid edge-swipe opens a right-positioned drawer', () => {
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { initialRouteName: 'Home', drawerPosition: 'right' },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    expect(isOpenByOverlay()).toBe(false);
    swipe(RIGHT_EDGE_OPEN_SWIPE);
    expect(isOpenByOverlay()).toBe(true);
  });

  // Before this fix, Drawer never wrapped its focused screen in NavigationContext.Provider at
  // all, so every one of these hooks threw "must be used within a screen rendered by <Stack>" the
  // moment a Drawer screen called them. These cases prove the context is now provided and the
  // focus semantics (focused when it's the current index, blurred otherwise) are wired.
  it('useNavigation()/useRoute() are usable inside a Drawer screen, and useIsFocused() reflects the focused route', () => {
    let homeIsFocused: boolean | undefined;
    let homeRouteName: string | undefined;
    let profileIsFocused: boolean | undefined;

    function TrackedHomeScreen(): ReturnType<typeof createElement> {
      const navigation = useNavigation();
      homeIsFocused = useIsFocused();
      homeRouteName = useRoute().name;
      // Merely proving the handle is a real IDrawerNavigatorHandle (openDrawer/jumpTo/...), not
      // the Stack-only shape this Context value was hard-typed to before the widened union.
      expect(typeof navigation.jumpTo).toBe('function');
      return createElement('symbiote-text', {}, 'home');
    }
    function TrackedProfileScreen(): ReturnType<typeof createElement> {
      profileIsFocused = useIsFocused();
      return createElement('symbiote-text', {}, 'profile');
    }

    const ref = createRef<IDrawerNavigatorHandle>();
    // Drawer's own focus-emitting effect runs in the same commit as the initial mount, but the
    // setIsFocused(true) it triggers inside useIsFocused's listener lands in a follow-up render -
    // act() is what drains that cascade synchronously (mirrors every other state-changing call in
    // this file already being act()-wrapped).
    act(() => {
      mount(
        ROOT_TAG,
        createElement(
          Drawer,
          { ref, initialRouteName: 'Home' },
          createElement(Drawer.Screen, { name: 'Home', component: TrackedHomeScreen }),
          createElement(Drawer.Screen, { name: 'Profile', component: TrackedProfileScreen }),
        ),
      );
    });
    expect(homeIsFocused).toBe(true);
    expect(homeRouteName).toBe('Home');

    act(() => ref.current?.jumpTo('Profile'));
    expect(profileIsFocused).toBe(true);
  });

  it('merges navigator-level screenOptions under a screen that does not override them', () => {
    let capturedDrawerLabel: string | undefined;
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        {
          initialRouteName: 'Home',
          screenOptions: { drawerLabel: 'Shared Label' },
          renderDrawerContent: ({ state, descriptors }) => {
            const homeRoute = state.routes.find(route => route.name === 'Home');
            capturedDrawerLabel = homeRoute
              ? descriptors[homeRoute.key]?.options.drawerLabel
              : undefined;
            return null;
          },
        },
        createElement(Drawer.Screen, { name: 'Home', component: HomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    expect(capturedDrawerLabel).toBe('Shared Label');
  });

  it('useFocusEffect runs on Drawer focus and its cleanup once jumpTo moves focus away', () => {
    const events: string[] = [];
    function TrackedHomeScreen(): ReturnType<typeof createElement> {
      useFocusEffect(
        useCallback(() => {
          events.push('effect');
          return () => events.push('cleanup');
        }, []),
      );
      return createElement('symbiote-text', {}, 'home');
    }

    const ref = createRef<IDrawerNavigatorHandle>();
    mount(
      ROOT_TAG,
      createElement(
        Drawer,
        { ref, initialRouteName: 'Home' },
        createElement(Drawer.Screen, { name: 'Home', component: TrackedHomeScreen }),
        createElement(Drawer.Screen, { name: 'Profile', component: ProfileScreen }),
      ),
    );
    // Drawer paints no native RNSScreen (unlike Stack), so there is no onAppear to wait for - the
    // focused screen's useFocusEffect runs as soon as it mounts.
    expect(events).toEqual(['effect']);

    act(() => ref.current?.jumpTo('Profile'));
    expect(events).toEqual(['effect', 'cleanup']);
  });
});
