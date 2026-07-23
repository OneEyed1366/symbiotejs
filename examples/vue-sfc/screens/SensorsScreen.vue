<!--
  @symbiote-native/sensors tour stop — one card per DeviceSensor-shaped sensor (Accelerometer,
  Gyroscope, Magnetometer, DeviceMotion) plus Pedometer (free functions, no shared instance —
  see packages/sensors/src/core/pedometer.ts). Every composable comes straight from
  @symbiote-native/sensors/vue; the core singletons/free functions (imported from the package
  root) are used ONLY for their own isAvailableAsync() check, kept as a separate ref per sensor
  so "not available on this device" never gets conflated with "no reading yet" — both look
  identical on the iOS Simulator (no real CoreMotion/CMPedometer hardware), and only a distinct
  UI state tells them apart (see the symbiote-expo-native-module skill). Vue SFC twin of
  ../../react/screens/SensorsScreen.tsx — same 4-state card (checking/unavailable/waiting/live)
  and X/Y/Z reading-chip layout, React being this repo's "prove the pattern first" adapter for
  this package.
-->
<script setup lang="ts">
import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import {
  Accelerometer,
  Gyroscope,
  Magnetometer,
  DeviceMotion,
  isAvailableAsync as isPedometerAvailableAsync,
} from '@symbiote-native/sensors';
import {
  useAccelerometer,
  useGyroscope,
  useMagnetometer,
  useDeviceMotion,
  usePedometer,
} from '@symbiote-native/sensors/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];

type ISensorAvailability = 'checking' | 'unavailable' | 'available';
type ISensorStatus = 'checking' | 'unavailable' | 'waiting' | 'live';

const SENSOR_STATUS_TEXT: Record<ISensorStatus, string> = {
  checking: 'CHECKING…',
  unavailable: 'UNAVAILABLE',
  waiting: 'WAITING…',
  live: 'LIVE',
};

// Wires one sensor's own isAvailableAsync() check into a local ref, on mount — kept separate
// from the composable's live-reading ref so "checking" / "not available" / "waiting for first
// reading" render as three genuinely distinct states, not one blank guess.
function useSensorAvailability(checkAsync: () => Promise<boolean>): Ref<ISensorAvailability> {
  const availability = ref<ISensorAvailability>('checking');
  onMounted(() => {
    void checkAsync().then(available => {
      availability.value = available ? 'available' : 'unavailable';
    });
  });
  return availability;
}

function sensorStatus(
  availability: Ref<ISensorAvailability>,
  hasReading: () => boolean,
): ComputedRef<ISensorStatus> {
  return computed(() => {
    if (availability.value === 'checking') return 'checking';
    if (availability.value === 'unavailable') return 'unavailable';
    return hasReading() ? 'live' : 'waiting';
  });
}

const accelerometer = useAccelerometer();
const accelerometerAvailability = useSensorAvailability(() => Accelerometer.isAvailableAsync());
const accelerometerStatus = sensorStatus(accelerometerAvailability, () => accelerometer.value !== null);

const gyroscope = useGyroscope();
const gyroscopeAvailability = useSensorAvailability(() => Gyroscope.isAvailableAsync());
const gyroscopeStatus = sensorStatus(gyroscopeAvailability, () => gyroscope.value !== null);

const magnetometer = useMagnetometer();
const magnetometerAvailability = useSensorAvailability(() => Magnetometer.isAvailableAsync());
const magnetometerStatus = sensorStatus(magnetometerAvailability, () => magnetometer.value !== null);

const deviceMotion = useDeviceMotion();
const deviceMotionAvailability = useSensorAvailability(() => DeviceMotion.isAvailableAsync());
const deviceMotionStatus = sensorStatus(deviceMotionAvailability, () => deviceMotion.value !== null);

const pedometer = usePedometer();
const pedometerAvailability = useSensorAvailability(() => isPedometerAvailableAsync());
const pedometerStatus = sensorStatus(pedometerAvailability, () => pedometer.value !== null);
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView testID="sensors-scroll" class="screen" content-container-style="scroll-content">
      <View :class="`line-tag line-tag-${lineInfo.line}`">
        <Text class="line-tag-text">{{ `${lineInfo.code} · ${lineInfo.label}` }}</Text>
      </View>
      <View class="hero-card">
        <View class="hero-badge" :style="{ backgroundColor: LINE_COLOR.sensors }">
          <Text class="hero-badge-text">{{ lineInfo.code }}</Text>
        </View>
        <View class="hero-copy">
          <Text class="hero-title">Sensors</Text>
          <Text class="hero-body"
            >@symbiote-native/sensors — live readings from five expo-sensors-backed hooks. A
            simulator reports every CoreMotion/CMPedometer-backed sensor as unavailable; a real
            device is needed to see live readings.</Text
          >
        </View>
      </View>

      <!-- Accelerometer -->
      <View testID="sensor-card-accelerometer" class="sensor-card">
        <View class="sensor-card-header">
          <Text class="sensor-card-title">Accelerometer</Text>
          <View :class="`sensor-status-badge sensor-status-badge-${accelerometerStatus}`">
            <Text class="sensor-status-text">{{ SENSOR_STATUS_TEXT[accelerometerStatus] }}</Text>
          </View>
        </View>
        <Text v-if="accelerometerStatus === 'checking'" class="info-text">checking availability…</Text>
        <Text v-else-if="accelerometerStatus === 'unavailable'" class="info-text"
          >not available on this device</Text
        >
        <Text v-else-if="accelerometerStatus === 'waiting'" class="info-text">waiting for first reading…</Text>
        <View v-else-if="accelerometer" class="sensor-reading-row">
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">X</Text>
            <Text class="sensor-reading-value">{{ accelerometer.x.toFixed(3) }}</Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Y</Text>
            <Text class="sensor-reading-value">{{ accelerometer.y.toFixed(3) }}</Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Z</Text>
            <Text class="sensor-reading-value">{{ accelerometer.z.toFixed(3) }}</Text>
          </View>
        </View>
      </View>

      <!-- Gyroscope -->
      <View testID="sensor-card-gyroscope" class="sensor-card">
        <View class="sensor-card-header">
          <Text class="sensor-card-title">Gyroscope</Text>
          <View :class="`sensor-status-badge sensor-status-badge-${gyroscopeStatus}`">
            <Text class="sensor-status-text">{{ SENSOR_STATUS_TEXT[gyroscopeStatus] }}</Text>
          </View>
        </View>
        <Text v-if="gyroscopeStatus === 'checking'" class="info-text">checking availability…</Text>
        <Text v-else-if="gyroscopeStatus === 'unavailable'" class="info-text">not available on this device</Text>
        <Text v-else-if="gyroscopeStatus === 'waiting'" class="info-text">waiting for first reading…</Text>
        <View v-else-if="gyroscope" class="sensor-reading-row">
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">X</Text>
            <Text class="sensor-reading-value">{{ gyroscope.x.toFixed(3) }}</Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Y</Text>
            <Text class="sensor-reading-value">{{ gyroscope.y.toFixed(3) }}</Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Z</Text>
            <Text class="sensor-reading-value">{{ gyroscope.z.toFixed(3) }}</Text>
          </View>
        </View>
      </View>

      <!-- Magnetometer -->
      <View testID="sensor-card-magnetometer" class="sensor-card">
        <View class="sensor-card-header">
          <Text class="sensor-card-title">Magnetometer</Text>
          <View :class="`sensor-status-badge sensor-status-badge-${magnetometerStatus}`">
            <Text class="sensor-status-text">{{ SENSOR_STATUS_TEXT[magnetometerStatus] }}</Text>
          </View>
        </View>
        <Text v-if="magnetometerStatus === 'checking'" class="info-text">checking availability…</Text>
        <Text v-else-if="magnetometerStatus === 'unavailable'" class="info-text"
          >not available on this device</Text
        >
        <Text v-else-if="magnetometerStatus === 'waiting'" class="info-text">waiting for first reading…</Text>
        <View v-else-if="magnetometer" class="sensor-reading-row">
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">X</Text>
            <Text class="sensor-reading-value">{{ magnetometer.x.toFixed(3) }}</Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Y</Text>
            <Text class="sensor-reading-value">{{ magnetometer.y.toFixed(3) }}</Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Z</Text>
            <Text class="sensor-reading-value">{{ magnetometer.z.toFixed(3) }}</Text>
          </View>
        </View>
      </View>

      <!-- DeviceMotion — rotation is nested and can legitimately be absent from the very first
           event (the underlying sensor hasn't reported yet), so it's guarded at the field
           itself (deviceMotion?.rotation, not deviceMotion && deviceMotion.rotation — an
           unguarded nested read throws with no visible error and silently blanks the screen). -->
      <View testID="sensor-card-device-motion" class="sensor-card">
        <View class="sensor-card-header">
          <Text class="sensor-card-title">Device motion</Text>
          <View :class="`sensor-status-badge sensor-status-badge-${deviceMotionStatus}`">
            <Text class="sensor-status-text">{{ SENSOR_STATUS_TEXT[deviceMotionStatus] }}</Text>
          </View>
        </View>
        <Text v-if="deviceMotionStatus === 'checking'" class="info-text">checking availability…</Text>
        <Text v-else-if="deviceMotionStatus === 'unavailable'" class="info-text"
          >not available on this device</Text
        >
        <Text v-else-if="deviceMotionStatus === 'waiting'" class="info-text">waiting for first reading…</Text>
        <template v-else-if="deviceMotion">
          <Text class="info-text">{{ `interval: ${deviceMotion.interval.toFixed(1)}ms` }}</Text>
          <View v-if="deviceMotion.rotation" class="sensor-reading-row">
            <View class="sensor-reading-chip">
              <Text class="sensor-reading-label">ALPHA</Text>
              <Text class="sensor-reading-value">{{ deviceMotion.rotation.alpha.toFixed(3) }}</Text>
            </View>
            <View class="sensor-reading-chip">
              <Text class="sensor-reading-label">BETA</Text>
              <Text class="sensor-reading-value">{{ deviceMotion.rotation.beta.toFixed(3) }}</Text>
            </View>
            <View class="sensor-reading-chip">
              <Text class="sensor-reading-label">GAMMA</Text>
              <Text class="sensor-reading-value">{{ deviceMotion.rotation.gamma.toFixed(3) }}</Text>
            </View>
          </View>
        </template>
      </View>

      <!-- Pedometer — free functions, no shared instance, so both the availability check and
           the live subscription go through the standalone core exports instead of a singleton. -->
      <View testID="sensor-card-pedometer" class="sensor-card">
        <View class="sensor-card-header">
          <Text class="sensor-card-title">Pedometer</Text>
          <View :class="`sensor-status-badge sensor-status-badge-${pedometerStatus}`">
            <Text class="sensor-status-text">{{ SENSOR_STATUS_TEXT[pedometerStatus] }}</Text>
          </View>
        </View>
        <Text v-if="pedometerStatus === 'checking'" class="info-text">checking availability…</Text>
        <Text v-else-if="pedometerStatus === 'unavailable'" class="info-text">not available on this device</Text>
        <Text v-else-if="pedometerStatus === 'waiting'" class="info-text">waiting for first reading…</Text>
        <Text v-else-if="pedometer" testID="sensors-pedometer-steps" class="sensor-reading-value"
          >{{ `${pedometer.steps} steps` }}</Text
        >
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
