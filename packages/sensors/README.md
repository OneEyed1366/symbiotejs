# @symbiote-native/sensors

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-sensors`](https://github.com/expo/expo/tree/main/packages/expo-sensors) — Accelerometer,
Barometer, DeviceMotion, Gyroscope, LightSensor, Magnetometer, MagnetometerUncalibrated, and
Pedometer — usable from **every** adapter, React, Vue, and Angular. Unlike this repo's other
wrappers ([`@symbiote-native/slider`](../slider), [`@symbiote-native/navigation`](../navigation),
[`@symbiote-native/splash-screen`](../splash-screen)), `expo-sensors` isn't a plain RN native
module or view — it's built on `expo-modules-core`, so its native code autolinks straight out of
`node_modules` via `expo-modules-autolinking`, no proxy `react-native.config.cjs`/podspec to ship.
`expo-sensors`' own JS is never imported (it hard-imports the full `expo` meta-package, which this
project never depends on) — every sensor's logic is hand-ported into this package's own `core/`.

## Install

```bash
npm install @symbiote-native/sensors
```

Depends on `expo-sensors` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions — never a caret range, since this package's `core/` is hand-ported against one specific
native API shape and a newer resolve could silently drift the two apart). Never install
`expo-sensors` yourself, and never add the `expo` package to this project.

## Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-sensors`' native code is discovered by
`expo-modules-autolinking`, not RN's own `react-native.config.cjs` mechanism — this needs wiring
into the native host app **once**, covering this package and every future `expo-modules-core`
package with zero further changes:

| Platform | Touches |
|---|---|
| iOS | `ios/Podfile` — add `use_expo_modules!` |
| iOS | `AppDelegate.swift` — Expo's runtime-bootstrap hook |
| Android | `settings.gradle` / `app/build.gradle` — resolve and include the Expo Gradle projects |
| Android | `MainApplication.kt` — Expo's bootstrap hook, plus a hand-written native-module name map (there's no `expo` meta-package here to auto-generate one) |

Full mechanics — the Podfile pieces that normally ship inside the `expo` package, the `expo`
peer-dependency exclusion list, per-sensor permission strings — live in the
`symbiote-expo-native-module` skill. Reference implementation: `.examples/react/ios/Podfile` and
`.examples/react/android/app/src/main/java/com/canary/MainApplication.kt`.

Permissions ship with the native module itself — nothing to reimplement, just the platform
permission string each sensor needs (e.g. DeviceMotion/Pedometer need `NSMotionUsageDescription`
on iOS).

## Shape

```
src/core/             DeviceSensor base class + one class per sensor (Accelerometer, Barometer,
                       DeviceMotion, Gyroscope, LightSensor, Magnetometer,
                       MagnetometerUncalibrated); Pedometer is free functions instead — upstream
                       has no shared instance for it. native/ resolves each sensor's native
                       module by name through expo-modules-core's requireNativeModule.
src/react/hooks/       @symbiote-native/sensors/react   — useAccelerometer, useBarometer, ...
src/vue/composables/   @symbiote-native/sensors/vue     — useAccelerometer, useBarometer, ... (same names)
src/angular/services/  @symbiote-native/sensors/angular — AccelerometerService, BarometerService, ...
```

Each adapter's hook/composable/service is a thin lifecycle wrapper (subscribe on mount, unsubscribe
on unmount) over the same `core` singleton — the subscription, permission, and update-interval
logic is written once and shared by all three.

## Use it

### A `DeviceSensor`-shaped sensor (Accelerometer, Barometer, DeviceMotion, Gyroscope, LightSensor, Magnetometer, MagnetometerUncalibrated)

```tsx
// React
import { useAccelerometer } from '@symbiote-native/sensors/react';

function SensorsScreen() {
  const accelerometer = useAccelerometer();
  return <Text>{accelerometer && `x ${accelerometer.x} · y ${accelerometer.y} · z ${accelerometer.z}`}</Text>;
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { useAccelerometer } from '@symbiote-native/sensors/vue';

const accelerometer = useAccelerometer();
</script>
<template>
  <Text>{{ accelerometer && `x ${accelerometer.x} · y ${accelerometer.y} · z ${accelerometer.z}` }}</Text>
</template>
```

```ts
// Angular
import { Component, inject } from '@angular/core';
import { AccelerometerService } from '@symbiote-native/sensors/angular';

@Component({ /* ... */ })
export class SensorsScreen {
  readonly accelerometer = inject(AccelerometerService).connect();
}
```

The React example above mirrors the real demo screen, `.examples/react/screens/SensorsScreen.tsx`
— the Vue and Angular snippets are illustrative; those adapters' own demo screens aren't wired up
yet (React is this repo's "prove the pattern first" adapter for this package).

Every hook/composable/`connect()` takes an optional `updateIntervalMs` and returns `null` until the
first native reading arrives — check `isAvailableAsync()` separately if you need to distinguish
"not available on this device" from "no reading yet" (see [Notes](#notes) below).

### Pedometer — free functions, no shared instance

```ts
import { watchStepCount, getStepCountAsync, isAvailableAsync } from '@symbiote-native/sensors';
import { usePedometer } from '@symbiote-native/sensors/react'; // or /vue, /angular's PedometerService

const pedometer = usePedometer(); // { steps: number } | null, live-subscribed
const { steps } = await getStepCountAsync(startDate, endDate); // one-shot, iOS only in practice
```

## Notes

- **Simulators have no real IMU/pedometer hardware.** `isAvailableAsync()` genuinely returns
  `false` on an iOS Simulator (every CoreMotion-backed sensor and `CMPedometer`); on an Android
  emulator, readings drift on their own even at rest, since the emulator synthesizes motion data
  rather than returning frozen zeros. Neither is a wiring bug; verify on a real device.
- **`DeviceMotion.rotation`/`.acceleration`/`.accelerationIncludingGravity`/`.rotationRate` are
  nested and may be absent from the very first event** (the underlying sensor hasn't reported yet)
  — guard the nested field itself (`deviceMotion?.rotation && ...`), not just the top-level object.
- **`rotation.beta` can read `NaN` near pitch ±90°** — an inherent Euler-angle gimbal-lock
  singularity in `CMAttitude`/the platform's device-orientation math (the same one
  `DeviceOrientationEvent.beta` has on the web), not a bug in this package.

## Test it

No Fabric/Descriptor angle at all — a sensor is a pure `EventEmitter` + async-function surface,
never a view. Tests inject a fake native-module object in place of the real
`requireNativeModule` resolution (`src/core/**/*.test.ts`, `src/{react,vue,angular}/**/*.test.{ts,tsx}`),
the same pattern `expo-sensors` itself uses upstream — no `installFabric()`, no ViewConfig.
