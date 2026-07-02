# @symbiote/angular

The **Angular adapter** for [symbiote](../../README.md) — render real native iOS/Android views
from Angular, on the *same* untouched core as React and Vue, with React Native's own renderer
never in the path. It is a `Renderer2`/`RendererFactory2` whose calls map onto the engine's
four-call mutation API; `@symbiote/engine` does the clone-on-write commit into Fabric.

Angular is the **second proof the core is genuinely framework-agnostic** (milestone M4): a third
framework, with its own change-detection model and AOT compilation pipeline, driving the
already-validated engine with zero changes to it.

<div align="center">

![Angular driving real native iOS views through symbiote](../../assets/angular-demo.gif)

</div>

> New to symbiote? The [root README](../../README.md) has the architecture.

---

## Use it

The native entry reaches the *same* `registerRunnable` seam as React and Vue — only the adapter
changes. It hands the surface's `rootTag` to `mount` from `@symbiote/angular`, which drives the
engine through Angular's `Renderer2`:

```js
// index.js
import { AppRegistry as RNAppRegistry } from 'react-native';
import { mount } from '@symbiote/angular';
import { AppComponent } from './App';
import { name as appName } from './app.json';

// registerRunnable (not registerComponent): RN stores a raw mount callback and never renders
// it with its own renderer. We mount the Angular app onto the surface's rootTag.
RNAppRegistry.registerRunnable(appName, ({ rootTag }) => {
  mount(rootTag, AppComponent);
});
```

The app is ordinary standalone Angular — it just imports primitives from `@symbiote/angular`
instead of `react-native`. A tap→increment counter:

```ts
import { Component, signal } from '@angular/core';
import { View, Text, Pressable } from '@symbiote/angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [View, Text, Pressable],
  template: `
    <View [style]="{ padding: 24 }">
      <Text>Taps: {{ count() }}</Text>
      <Pressable (press)="count.set(count() + 1)">
        <Text>Tap me</Text>
      </Pressable>
    </View>
  `,
})
export class AppComponent {
  count = signal(0);
}
```

The full canary is [`examples/angular`](../../examples/angular) — a stock RN 0.86 app whose
[`App.ts`](../../examples/angular/App.ts) exercises the same surface as the React and Vue
reference canaries, standalone components, zoneless change detection.

---

## Parity — and the two gaps

Angular reaches the same 21+ primitives, runtime modules, `Animated` on both drivers, gestures,
accessibility, and the `VirtualizedList` family as React and Vue. That parity is **structural, not
hand-copied**: the component logic (state machines + render functions) is written **once** in
`@symbiote/components`, and Angular supplies only its lifecycle (`Renderer2` + zoneless change
detection + the descriptor→`createElement` bridge).

Two deliberate gaps, both tracked, neither blocking the canary:

- **Third-party React component packages** (`@react-native-community/slider`) run only under the
  React adapter — their body calls React hooks off the React dispatcher, which is null under
  Angular. `@symbiote/slider` (this repo's own wrapper) *does* ship a real Angular build, reachable
  through the same `createNode`-by-ViewConfig path Angular uses for its own primitives — that
  wrapper is what makes a third-party native view usable from a non-React adapter at all.
- **Not yet on the docs site's live framework switcher.** React and Vue are; Angular's example app
  and adapter are otherwise at full canary parity.

---

## An Angular-specific gotcha — AOT compiles separately from Metro

Angular templates need `ngc` (Angular's own AOT compiler), which Metro cannot run per-file the way
it transforms a Vue SFC or JSX — `ngc` needs whole-program `compilationMode: 'partial'` first, then
`@angular/compiler-cli/linker/babel` drops the linked output into Metro per-file. In practice this
means every `ios`/`android`/`e2e:build:*` script runs `pnpm ng:build` first, and local development
needs `ngc --watch` running alongside Metro — `scripts/dev-with-watch.sh` in
[`examples/angular`](../../examples/angular) does exactly that (`ngc --watch` in the background,
Metro's `react-native start` in the foreground, since Metro reads raw keypresses off stdin and
can't sit behind a process manager that owns stdin itself).

Angular also requires **zoneless change detection** (`provideZonelessChangeDetection`,
`@angular/core >=20`) — zone.js fights Hermes, and versions before 20 don't offer a stable
zoneless API. This is the version floor for the whole adapter, not a suggestion.

The full seam map, bootstrap sequence, and AOT pipeline live in the `angular-adapter` project
skill — read it before touching adapter internals.

---

## Run it

[`examples/angular`](../../examples/angular) is a stock React Native 0.86 app. Requires Node ≥
22.13 and the [RN environment setup](https://reactnative.dev/docs/set-up-your-environment) (Xcode,
CocoaPods):

```bash
cd examples/angular
pnpm install                   # workspace root already covers this if you ran it there
bundle install                 # first time only — installs CocoaPods itself
bundle exec pod install        # fetch native pods

# terminal 1 — ngc --watch (background) + Metro (foreground). DEBUG=1 turns on diagnostic logs.
DEBUG=1 pnpm dev

# terminal 2 — build + launch (each runs ng:build first)
pnpm ios                       # iOS simulator
pnpm android                   # Android emulator
```

---

## Test it

```bash
pnpm test                      # vitest, from the workspace root — headless, fake Fabric slot

cd examples/angular
pnpm e2e:build:ios             # ng:build, then build the app for Detox
pnpm e2e:test:ios              # run the canary journeys on the iOS simulator
# …or the android equivalents: e2e:build:android / e2e:test:android
```

Why these come for free — a symbiote app is a stock RN app underneath, so RN's whole testing
ecosystem applies unchanged. See [Testing](../../README.md#testing).
