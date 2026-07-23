# @symbiote-native/sensors

## 0.2.0

### Minor Changes

- 26af374: Add `@symbiote-native/sensors`, a framework-agnostic wrapper around `expo-sensors` (built on
  `expo-modules-core`, never the `expo` meta-package). Ships Accelerometer, Barometer,
  DeviceMotion, Gyroscope, LightSensor, Magnetometer, MagnetometerUncalibrated, and Pedometer, each
  with a shared core sensor class plus a lifecycle wrapper per adapter — React hooks, Vue
  composables, Angular services — all driving the same native module. `expo-sensors`' own JS is
  never imported (it hard-imports the `expo` package); the sensor logic is hand-ported into this
  package's core, with only the native ios/android module code coming from `expo-sensors` via
  autolinking.
