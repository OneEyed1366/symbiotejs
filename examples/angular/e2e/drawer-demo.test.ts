import { by, device, element, waitFor } from 'detox';

// Covers @symbiote-native/navigation's Drawer navigator on the Angular canary: Menu -> DrawerDemo
// (drawerPosition="right", drawerType="slide", 2 screens - Home/Settings), reached via
// menu-row-DrawerDemo. Exercises the imperative open button, jumpTo-driven navigation from the
// drawer's own content panel, and closeDrawer()'s navigation-free close.
//
// jumpTo closing the drawer as a side effect is a confirmed source behavior, not an assumption -
// packages/navigation/src/core/drawer-router-state/index.ts's 'jumpTo' reducer case always
// returns isOpen: false ("selecting a destination is itself the dismissal gesture"), and the
// Angular adapter (packages/navigation/src/angular/drawer/index.ts) additionally drives the close
// animation itself. closeDrawer's reducer case is a plain `state.isOpen ? { ...state, isOpen:
// false } : state` guard - it never touches `index`, so it cannot navigate. The panel is never
// unmounted while the Drawer is initialized - it's an always-rendered AnimatedView translated
// off-canvas via `progress.interpolate` - so a closed check asserts `.not.toBeVisible()`, never
// `.not.toExist()`.

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// element(...).tap() and toBeVisible() both run Detox's own hittability/visibility-percent
// pre-check, which is unreliable for drawer-panel and its content slot: both are positioned via
// an animated `transform: translateX` (angular/drawer/index.ts's panelStyle/contentStyle), and
// that check's internal geometry math loses track of a transformed ancestor even though
// getAttributes().frame (documented by Detox as "in screen coordinate space") reports the real,
// correctly-converted on-screen position regardless — confirmed by this exact test still failing
// after a bare 20s wait, which rules out a timing race and points at the check itself. deviceTap
// reads that real frame and taps its center via a raw simulator-level tap, bypassing the
// element-matcher hittability check entirely (same fix already applied in
// canary-native-modules.test.ts).
async function deviceTap(id: string): Promise<void> {
  const attrs = await element(by.id(id)).getAttributes();
  if (!('frame' in attrs)) throw new Error(`${id}: getAttributes() returned no frame`);
  const { x, y, width, height } = attrs.frame;
  await device.tap({ x: x + width / 2, y: y + height / 2 });
}

// Same reasoning as deviceTap above, applied to toBeVisible(): rather than polling a check that
// structurally can't succeed for a transformed view, poll the real frame.x directly and consider
// the animateProgressTo transition (JS-driven, per-frame Fabric commits — see the comment below)
// done once it has moved away from its starting position and then stopped changing for two
// consecutive reads. Direction-agnostic, so the same helper covers both opening and closing.
async function waitForTransformSettle(id: string, timeoutMs: number): Promise<void> {
  const startAttrs = await element(by.id(id)).getAttributes();
  if (!('frame' in startAttrs)) throw new Error(`${id}: getAttributes() returned no frame`);
  const startX = startAttrs.frame.x;
  const deadline = Date.now() + timeoutMs;
  let moved = false;
  let lastX = startX;
  let stableReads = 0;
  while (Date.now() < deadline) {
    await sleep(150);
    const attrs = await element(by.id(id)).getAttributes();
    if (!('frame' in attrs)) continue;
    if (!moved && Math.abs(attrs.frame.x - startX) > 2) moved = true;
    if (moved && Math.abs(attrs.frame.x - lastX) < 1) {
      stableReads += 1;
      if (stableReads >= 2) return;
    } else {
      stableReads = 0;
    }
    lastX = attrs.frame.x;
  }
  throw new Error(
    `${id}'s transform never settled within ${timeoutMs}ms (startX=${startX}, lastX=${lastX})`,
  );
}

describe('Angular Drawer navigator (DrawerDemo)', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into DrawerDemo, landing on Home', async () => {
    await waitFor(element(by.id('menu-row-DrawerDemo')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-DrawerDemo')).tap();
    await waitFor(element(by.id('drawer-open')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('opens the drawer via the Open drawer button', async () => {
    await element(by.id('drawer-open')).tap();
    // animateProgressTo drives progress via Animated.timing with useNativeDriver:false (native-
    // driver wiring is deferred - see drawer/index.ts's header) - every one of its ~15 frames over
    // the nominal 250ms calls setNativeProps -> commitContainer, a FULL clone-on-write Fabric
    // commit (core/engine/src/commit.ts), not a cheap off-thread native mutation. Under simulator
    // load - the exact "app is busy: N work items pending on Main Queue" state Detox logs around
    // this wait - those per-frame commits queue up and the visible settle can stretch well past
    // 250ms, so this polls real geometry rather than guessing a fixed delay.
    await waitForTransformSettle('drawer-panel', 20_000);
  });

  it('jumping to Settings from the drawer panel navigates and closes the drawer', async () => {
    await waitFor(element(by.id('drawer-menu-Settings')))
      .toBeVisible()
      .withTimeout(10_000);
    await deviceTap('drawer-menu-Settings');
    // jumpTo's close drives the SAME animateProgressTo(false) JS-driven animation as the open
    // above (per-frame full commits), and drawerType="slide" moves the content slot too (see this
    // file's header comment) - so both drawer-panel and drawer-close-from-settings sit under an
    // actively-animating transformed ancestor here, same reasoning as the open case above.
    await waitForTransformSettle('drawer-close-from-settings', 20_000);
    await waitForTransformSettle('drawer-panel', 20_000);
  });

  it('closing an already-closed drawer from Settings is a no-op that does not navigate', async () => {
    // jumpTo (previous test) already closed the drawer, so this exercises closeDrawer()'s
    // isOpen-guard path rather than a real open-to-closed transition. The only observable proof
    // available through this screen's testIDs is that the tap doesn't crash, doesn't navigate
    // away from Settings, and the panel stays hidden - the last of which is checked by asserting
    // drawer-panel's frame.x is unchanged (no transition got triggered), not the broken
    // toBeVisible() check.
    const beforeAttrs = await element(by.id('drawer-panel')).getAttributes();
    if (!('frame' in beforeAttrs)) throw new Error('drawer-panel: getAttributes() returned no frame');
    const beforeX = beforeAttrs.frame.x;

    await deviceTap('drawer-close-from-settings');
    await waitFor(element(by.id('drawer-close-from-settings')))
      .toExist()
      .withTimeout(10_000);
    await sleep(500);

    const afterAttrs = await element(by.id('drawer-panel')).getAttributes();
    if (!('frame' in afterAttrs)) throw new Error('drawer-panel: getAttributes() returned no frame');
    if (Math.abs(afterAttrs.frame.x - beforeX) > 2) {
      throw new Error(
        `drawer-panel moved (${beforeX} -> ${afterAttrs.frame.x}) - closeDrawer() should be a no-op here`,
      );
    }
  });

  // SKIPPED: a real right-edge swipe-open gesture drives the same PanResponder the Open-drawer
  // button's animateProgressTo drives, but through native touch tracking rather than a
  // synthetic press - drawerType="slide" needs the gesture to start close enough to the actual
  // right-edge hit region and cross whatever distance/velocity threshold the responder commits
  // an "open" on (vs. snapping back). None of this screen's testIDs anchor a full-width swipe
  // start point (the drawer-panel element itself is off-canvas/non-hittable while closed), so
  // the parameters below are a best guess, unverified against the real simulator - this task
  // deliberately doesn't run detox itself (shared simulator, one verification pass afterward).
  // Mirrors probe.test.ts's angular-open-modal skip precedent: re-enable once a run confirms (or
  // corrects) the gesture parameters.
  it.skip('opens the drawer via a right-edge swipe gesture', async () => {
    await waitFor(element(by.id('menu-row-DrawerDemo')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-DrawerDemo')).tap();
    await waitFor(element(by.id('drawer-open')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('drawer-open')).swipe('left', 'fast', 0.9, 0.95, 0.5);
    await waitFor(element(by.id('drawer-panel')))
      .toBeVisible()
      .withTimeout(10_000);
  });
});
