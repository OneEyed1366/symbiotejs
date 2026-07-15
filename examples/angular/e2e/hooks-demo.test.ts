import { by, device, element, waitFor } from 'detox';

// Journey coverage for HooksDemoScreen (../screens/HooksDemoScreen.ts), reached from the Menu's
// "Hooks" row. The screen has no navigation of its own — it's a pure introspection display of
// injectIsFocused/injectFocusEffect/injectNavigationState — so the only thing worth proving here
// is that those three hooks read real live navigator state on first mount. A focus->blur->focus
// cycle (proving injectFocusEffect's counter increments and its cleanup records a blur) needs a
// second navigation past this screen; see the documented skip below for why that isn't driven here.

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// The Menu's testID rows are laid out in the ScrollView's original render order (see
// MenuScreen.ts), and HooksDemo is row 7 of 9 - below the fold on a 402x874pt simulator, so it
// exists in the tree but isn't visible/hittable until scrolled into view. Same pattern as
// probe.test.ts's bringIntoView, targeting menu-scroll instead of angular-canary-scroll.
async function bringIntoView(id: string): Promise<void> {
  const scrollView = element(by.id('menu-scroll'));
  const target = element(by.id(id));
  await scrollView.scrollTo('top');
  for (let step = 0; step < 15; step += 1) {
    try {
      await waitFor(target).toBeVisible().withTimeout(400);
      break;
    } catch {
      await scrollView.scroll(500, 'down');
    }
  }
  await waitFor(target).toBeVisible().withTimeout(3_000);
  await sleep(300);
}

// Detox's waitFor has no text-predicate form, so poll getAttributes() until the testID's text
// matches. Same pattern as examples/react/e2e/canary-journeys.test.ts's waitForText — needed here
// because hooks-focus-count's value depends on how many times the screen has (re)focused.
async function elementText(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes();
  if ('text' in attrs && typeof attrs.text === 'string') return attrs.text;
  return '';
}

async function waitForText(id: string, matches: (text: string) => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = await elementText(id);
    if (matches(last)) return;
    await sleep(250);
  }
  throw new Error(`${id} never matched within ${timeoutMs}ms; last text was "${last}"`);
}

describe('Angular Hooks demo', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
    // The first test scrolls immediately via bringIntoView, whose first line is an unguarded
    // scrollTo('top') on menu-scroll — wait for the Menu screen's own ScrollView to actually be
    // laid out (real bounds, not zero-height) before that runs, or it races the app's initial
    // mount and throws. Same fix as canary-lists-scroll.test.ts's beforeAll.
    await waitFor(element(by.id('menu-scroll')))
      .toBeVisible()
      .withTimeout(10_000);
    await sleep(300);
  });

  it('navigates from the menu into the HooksDemo screen', async () => {
    await bringIntoView('menu-row-HooksDemo');
    await element(by.id('menu-row-HooksDemo')).tap();
    await waitFor(element(by.id('hooks-is-focused')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('reports focused on first mount via injectIsFocused', async () => {
    await waitForText('hooks-is-focused', text => text === 'injectIsFocused(): true', 5_000);
  });

  it('counts the first mount as focus #1 via injectFocusEffect', async () => {
    await waitForText('hooks-focus-count', text => text === 'injectFocusEffect focus count: 1', 5_000);
  });

  it('renders the live root-Stack route stack via injectNavigationState', async () => {
    await waitFor(element(by.text('0. Menu')))
      .toExist()
      .withTimeout(10_000);
    await waitFor(element(by.text('1. HooksDemo')))
      .toExist()
      .withTimeout(10_000);
  });

  // SKIPPED: proving injectFocusEffect's counter increments (and its cleanup records a blur)
  // needs a real focus->blur->focus cycle, which needs navigating AWAY from this screen and back.
  // HooksDemoScreen has no navigation of its own, and hooksDemoOptions (App.ts) sets
  // headerShown: true so react-native-screens draws a native back chevron in the header — but
  // there's no testID on it, and this suite can't verify a guessed matcher (by.traits(['button'])
  // or by.label(<Menu's title>)) against the shared simulator this session, so a wrong guess would
  // silently rot this test rather than catch a regression. Per project convention (see
  // probe.test.ts's angular-open-modal skip and the symbiote-detox-e2e skill), documenting the gap
  // beats shipping an unverified native-chrome matcher. Re-enable once a stable back-button testID
  // exists (e.g. a `headerBackTestID` escape hatch on IAngularScreenOptions) or the matcher above
  // has been confirmed against a real device/simulator run.
  it.skip('increments the focus count across a focus->blur->focus cycle', async () => {
    await element(by.id('menu-row-HooksDemo')).tap();
    await waitForText('hooks-focus-count', text => text === 'injectFocusEffect focus count: 2', 5_000);
  });
});
