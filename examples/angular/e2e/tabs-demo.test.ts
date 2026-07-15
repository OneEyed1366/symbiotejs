import { by, device, element, waitFor } from 'detox';

// Covers @symbiote-native/navigation's Tab (bottom-tabs) navigator on the Angular canary:
// Menu -> TabsDemo (3 tabs - Home/Search/Profile), tab switching, and injectIsFocused()
// correctly flipping back to true on re-focus after switching away and back.
//
// Tab-bar targeting: renderTabBarItem (packages/navigation/src/core/render-tabs.ts) builds each
// tab item as `passthrough: {}` plus a plain `txt({...}, [item.label])` - no testID anywhere on
// the tab bar or its items, so `by.text(<tabBarLabel>)` is the only way to tap a tab. Confirmed
// safe against collision: the tab bar always paints all three labels ("Home"/"Search"/"Profile")
// regardless of which tab is focused, and neither string appears anywhere else in the currently
// mounted tree - MenuScreen's row labels ("Tabs", "Drawer", "Header options", ...) and
// TabsDemoScreen's own line-tag/hero copy ("TB · STRUCTURE LINE", "TB", "Tabs", "Search tab",
// "Profile tab") are all distinct strings (grep-verified across screens/ and App.ts). Each tab
// screen's `{{ 'focused: ' + isFocused() }}` is a single-line interpolation (no testID), so
// `by.text('focused: true')` is safe too - see the symbiote-detox-e2e skill's note on multi-line
// `{{ }}` interpolation preserving whitespace and breaking exact by.text() matches, which does
// not apply here since this interpolation stays on one line.

describe('Angular Tab navigator (TabsDemo)', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into TabsDemo, landing on the Home tab', async () => {
    await waitFor(element(by.id('menu-row-TabsDemo')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-TabsDemo')).tap();
    // initialRouteName="Home" - Home's injectIsFocused() flips true once Tab's queueMicrotask'd
    // FOCUS emit lands (see angular/tabs/index.ts's focusedRouteEmitter), so this also proves the
    // Tab navigator mounted and routed to the right initial screen.
    await waitFor(element(by.text('focused: true')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('switches to the Search tab and shows its content', async () => {
    await waitFor(element(by.text('Search')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.text('Search')).tap();
    await waitFor(element(by.text('Search tab')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('switches to the Profile tab and shows its content', async () => {
    await waitFor(element(by.text('Profile')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.text('Profile')).tap();
    await waitFor(element(by.text('Profile tab')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('switches back to the Home tab and re-focuses it', async () => {
    await waitFor(element(by.text('Home')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.text('Home')).tap();
    // Tab mounts only the focused route's component (NgComponentOutlet keyed on a single
    // `focusedRoute()`), so switching away and back destroys and recreates TabHomeScreen -
    // injectIsFocused() must go through its full unfocused -> refocused cycle again, not just
    // stay stale at whatever it read on first mount.
    await waitFor(element(by.text('focused: true')))
      .toBeVisible()
      .withTimeout(10_000);
  });
});
