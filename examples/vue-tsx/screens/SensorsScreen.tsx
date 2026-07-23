import { computed, defineComponent, onMounted, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/vue';
import {
  useAccelerometer,
  useDeviceMotion,
  useGyroscope,
  useMagnetometer,
  usePedometer,
} from '@symbiote-native/sensors/vue';
import {
  Accelerometer,
  DeviceMotion,
  Gyroscope,
  Magnetometer,
  isAvailableAsync as isPedometerAvailableAsync,
} from '@symbiote-native/sensors';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ISensorAvailability = 'checking' | 'unavailable' | 'available';
type ISensorStatus = 'checking' | 'unavailable' | 'waiting' | 'live';

const SENSOR_STATUS_TEXT: Record<ISensorStatus, string> = {
  checking: 'CHECKING…',
  unavailable: 'UNAVAILABLE',
  waiting: 'WAITING…',
  live: 'LIVE',
};

// Resolves once per sensor on mount — kept separate from the live-measurement ref (useX()
// composables from @symbiote-native/sensors/vue) so the screen can tell "not available on this
// device" apart from "available, no reading yet": 'checking' means the isAvailableAsync() check
// is still in flight.
function useSensorAvailability(checkAvailable: () => Promise<boolean>): Ref<ISensorAvailability> {
  const availability = ref<ISensorAvailability>('checking');

  onMounted(() => {
    checkAvailable().then(available => {
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

function renderSensorBody(status: ISensorStatus, children: () => unknown) {
  if (status === 'checking') return <Text class="info-text">checking availability…</Text>;
  if (status === 'unavailable') return <Text class="info-text">not available on this device</Text>;
  if (status === 'waiting') return <Text class="info-text">waiting for first reading…</Text>;
  return children();
}

function renderAxisRow(measurement: { x: number; y: number; z: number }) {
  return (
    <View class="sensor-reading-row">
      <View class="sensor-reading-chip">
        <Text class="sensor-reading-label">X</Text>
        <Text class="sensor-reading-value">{measurement.x.toFixed(3)}</Text>
      </View>
      <View class="sensor-reading-chip">
        <Text class="sensor-reading-label">Y</Text>
        <Text class="sensor-reading-value">{measurement.y.toFixed(3)}</Text>
      </View>
      <View class="sensor-reading-chip">
        <Text class="sensor-reading-label">Z</Text>
        <Text class="sensor-reading-value">{measurement.z.toFixed(3)}</Text>
      </View>
    </View>
  );
}

/**
 * Sensors demo: one card per @symbiote-native/sensors composable — Accelerometer, Gyroscope,
 * Magnetometer, DeviceMotion, Pedometer — each independently resolving isAvailableAsync() and
 * subscribing to live readings. iOS Simulator genuinely reports every CoreMotion/CMPedometer
 * sensor as unavailable (no real IMU/pedometer hardware) — that's expected, verify on a real
 * device to see live readings. Vue TSX twin of ../../react/screens/SensorsScreen.tsx — same
 * 4-state card (checking/unavailable/waiting/live) and X/Y/Z reading-chip layout, React being
 * this repo's "prove the pattern first" adapter for this package.
 */
export const SensorsScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];

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

    return () => (
      <SafeAreaView class="screen">
        <ScrollView testID="sensors-scroll" class="screen" contentContainerStyle="scroll-content">
          <View class={`line-tag line-tag-${lineInfo.line}`}>
            <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
          </View>
          <View class="hero-card">
            <View class="hero-badge" style={{ backgroundColor: LINE_COLOR.sensors }}>
              <Text class="hero-badge-text">{lineInfo.code}</Text>
            </View>
            <View class="hero-copy">
              <Text class="hero-title">Sensors</Text>
              <Text class="hero-body">
                @symbiote-native/sensors — live readings from five expo-sensors-backed hooks. A
                simulator reports every CoreMotion/CMPedometer-backed sensor as unavailable; a
                real device is needed to see live readings.
              </Text>
            </View>
          </View>

          <View class="sensor-card" testID="sensor-card-accelerometer">
            <View class="sensor-card-header">
              <Text class="sensor-card-title">Accelerometer</Text>
              <View class={`sensor-status-badge sensor-status-badge-${accelerometerStatus.value}`}>
                <Text class="sensor-status-text">{SENSOR_STATUS_TEXT[accelerometerStatus.value]}</Text>
              </View>
            </View>
            {renderSensorBody(
              accelerometerStatus.value,
              () => accelerometer.value && renderAxisRow(accelerometer.value),
            )}
          </View>

          <View class="sensor-card" testID="sensor-card-gyroscope">
            <View class="sensor-card-header">
              <Text class="sensor-card-title">Gyroscope</Text>
              <View class={`sensor-status-badge sensor-status-badge-${gyroscopeStatus.value}`}>
                <Text class="sensor-status-text">{SENSOR_STATUS_TEXT[gyroscopeStatus.value]}</Text>
              </View>
            </View>
            {renderSensorBody(gyroscopeStatus.value, () => gyroscope.value && renderAxisRow(gyroscope.value))}
          </View>

          <View class="sensor-card" testID="sensor-card-magnetometer">
            <View class="sensor-card-header">
              <Text class="sensor-card-title">Magnetometer</Text>
              <View class={`sensor-status-badge sensor-status-badge-${magnetometerStatus.value}`}>
                <Text class="sensor-status-text">{SENSOR_STATUS_TEXT[magnetometerStatus.value]}</Text>
              </View>
            </View>
            {renderSensorBody(
              magnetometerStatus.value,
              () => magnetometer.value && renderAxisRow(magnetometer.value),
            )}
          </View>

          <View class="sensor-card" testID="sensor-card-device-motion">
            <View class="sensor-card-header">
              <Text class="sensor-card-title">Device motion</Text>
              <View class={`sensor-status-badge sensor-status-badge-${deviceMotionStatus.value}`}>
                <Text class="sensor-status-text">{SENSOR_STATUS_TEXT[deviceMotionStatus.value]}</Text>
              </View>
            </View>
            {renderSensorBody(deviceMotionStatus.value, () => {
              const motion = deviceMotion.value;
              if (!motion) return null;
              return [
                <Text class="info-text">{`interval: ${motion.interval.toFixed(1)}ms`}</Text>,
                motion.rotation && (
                  <View class="sensor-reading-row">
                    <View class="sensor-reading-chip">
                      <Text class="sensor-reading-label">ALPHA</Text>
                      <Text class="sensor-reading-value">{motion.rotation.alpha.toFixed(3)}</Text>
                    </View>
                    <View class="sensor-reading-chip">
                      <Text class="sensor-reading-label">BETA</Text>
                      <Text class="sensor-reading-value">{motion.rotation.beta.toFixed(3)}</Text>
                    </View>
                    <View class="sensor-reading-chip">
                      <Text class="sensor-reading-label">GAMMA</Text>
                      <Text class="sensor-reading-value">{motion.rotation.gamma.toFixed(3)}</Text>
                    </View>
                  </View>
                ),
              ];
            })}
          </View>

          <View class="sensor-card" testID="sensor-card-pedometer">
            <View class="sensor-card-header">
              <Text class="sensor-card-title">Pedometer</Text>
              <View class={`sensor-status-badge sensor-status-badge-${pedometerStatus.value}`}>
                <Text class="sensor-status-text">{SENSOR_STATUS_TEXT[pedometerStatus.value]}</Text>
              </View>
            </View>
            {renderSensorBody(
              pedometerStatus.value,
              () =>
                pedometer.value && (
                  <Text testID="sensors-pedometer-steps" class="sensor-reading-value">
                    {`${pedometer.value.steps} steps`}
                  </Text>
                ),
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  },
  { name: 'SensorsScreen' },
);
