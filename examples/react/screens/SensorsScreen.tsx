import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/react';
import {
  Accelerometer,
  DeviceMotion,
  Gyroscope,
  Magnetometer,
  isAvailableAsync as isPedometerAvailableAsync,
} from '@symbiote-native/sensors';
import {
  useAccelerometer,
  useDeviceMotion,
  useGyroscope,
  useMagnetometer,
  usePedometer,
} from '@symbiote-native/sensors/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// Pedometer has no shared singleton upstream (see packages/sensors' core/pedometer.ts) — wrapped
// in a stable module-level object so useSensorAvailability's effect dependency stays referentially
// constant across renders, same as the Accelerometer/Gyroscope/Magnetometer/DeviceMotion
// singletons it's rendered alongside below.
const PEDOMETER_SENSOR = { isAvailableAsync: isPedometerAvailableAsync };

type ISensorAvailability = 'checking' | 'available' | 'unavailable';
type ISensorStatus = 'checking' | 'unavailable' | 'waiting' | 'live';

const SENSOR_STATUS_TEXT: Record<ISensorStatus, string> = {
  checking: 'CHECKING…',
  unavailable: 'UNAVAILABLE',
  waiting: 'WAITING…',
  live: 'LIVE',
};

// isAvailableAsync() is a separate call from the live-reading hook — a sensor can be
// "unavailable" (iOS Simulator, every CoreMotion/CMPedometer-backed sensor) or "waiting for a
// first reading" (available, subscribed, native hasn't reported yet); rendering both as the same
// blank state would hide a real bug behind expected simulator behavior (see the
// symbiote-expo-native-module skill, and frontend-ux-best-practices's "render every async state").
function useSensorAvailability(sensor: { isAvailableAsync: () => Promise<boolean> }): ISensorAvailability {
  const [availability, setAvailability] = useState<ISensorAvailability>('checking');

  useEffect(() => {
    let isMounted = true;
    sensor.isAvailableAsync().then(isAvailable => {
      if (isMounted) {
        setAvailability(isAvailable ? 'available' : 'unavailable');
      }
    });
    return () => {
      isMounted = false;
    };
  }, [sensor]);

  return availability;
}

function resolveSensorStatus(availability: ISensorAvailability, hasReading: boolean): ISensorStatus {
  if (availability === 'checking') {
    return 'checking';
  }
  if (availability === 'unavailable') {
    return 'unavailable';
  }
  return hasReading ? 'live' : 'waiting';
}

function SensorStatusBadge({ status }: { status: ISensorStatus }) {
  return (
    <View className={`sensor-status-badge sensor-status-badge-${status}`}>
      <Text className="sensor-status-text">{SENSOR_STATUS_TEXT[status]}</Text>
    </View>
  );
}

function SensorCard({
  testID,
  title,
  status,
  children,
}: {
  testID: string;
  title: string;
  status: ISensorStatus;
  children?: ReactNode;
}) {
  return (
    <View testID={testID} className="sensor-card">
      <View className="sensor-card-header">
        <Text className="sensor-card-title">{title}</Text>
        <SensorStatusBadge status={status} />
      </View>
      {status === 'checking' && <Text className="info-text">checking availability…</Text>}
      {status === 'unavailable' && <Text className="info-text">not available on this device</Text>}
      {status === 'waiting' && <Text className="info-text">waiting for first reading…</Text>}
      {status === 'live' && children}
    </View>
  );
}

function AxisReadingRow({ measurement }: { measurement: { x: number; y: number; z: number } }) {
  return (
    <View className="sensor-reading-row">
      <View className="sensor-reading-chip">
        <Text className="sensor-reading-label">X</Text>
        <Text className="sensor-reading-value">{measurement.x.toFixed(3)}</Text>
      </View>
      <View className="sensor-reading-chip">
        <Text className="sensor-reading-label">Y</Text>
        <Text className="sensor-reading-value">{measurement.y.toFixed(3)}</Text>
      </View>
      <View className="sensor-reading-chip">
        <Text className="sensor-reading-label">Z</Text>
        <Text className="sensor-reading-value">{measurement.z.toFixed(3)}</Text>
      </View>
    </View>
  );
}

/**
 * @symbiote-native/sensors canary demo: one card per hook — Accelerometer, Gyroscope,
 * Magnetometer, DeviceMotion, Pedometer — each rendering its own checking/unavailable/waiting/
 * live state distinctly (SensorCard above), never conflating "still checking" with "no reading
 * yet" or "not available on this device". The iOS Simulator genuinely reports every
 * CoreMotion/CMPedometer-backed sensor as unavailable — expected, not a wiring bug.
 *
 * DeviceMotion's nested `rotation` field is guarded at the field itself
 * (`deviceMotion?.rotation && …`), not just at the top-level `deviceMotion` object — the
 * underlying native sensor can report its first event before `rotation` is populated, and an
 * unguarded nested read throws with no visible error anywhere (no redbox, no logcat), silently
 * blanking the screen instead.
 */
export function SensorsScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];

  const accelerometer = useAccelerometer();
  const accelerometerStatus = resolveSensorStatus(
    useSensorAvailability(Accelerometer),
    accelerometer !== null,
  );

  const gyroscope = useGyroscope();
  const gyroscopeStatus = resolveSensorStatus(useSensorAvailability(Gyroscope), gyroscope !== null);

  const magnetometer = useMagnetometer();
  const magnetometerStatus = resolveSensorStatus(
    useSensorAvailability(Magnetometer),
    magnetometer !== null,
  );

  const deviceMotion = useDeviceMotion();
  const deviceMotionStatus = resolveSensorStatus(
    useSensorAvailability(DeviceMotion),
    deviceMotion !== null,
  );

  const pedometer = usePedometer();
  const pedometerStatus = resolveSensorStatus(
    useSensorAvailability(PEDOMETER_SENSOR),
    pedometer !== null,
  );

  return (
    <SafeAreaView className="screen">
      <ScrollView testID="sensors-scroll" className="screen" contentContainerStyle="scroll-content">
        <View className={`line-tag line-tag-${lineInfo.line}`}>
          <Text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View className="hero-card">
          <View className="hero-badge" style={{ backgroundColor: LINE_COLOR.sensors }}>
            <Text className="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View className="hero-copy">
            <Text className="hero-title">Sensors</Text>
            <Text className="hero-body">
              @symbiote-native/sensors — live readings from five expo-sensors-backed hooks. A
              simulator reports every CoreMotion/CMPedometer-backed sensor as unavailable; a
              real device is needed to see live readings.
            </Text>
          </View>
        </View>

        <SensorCard testID="sensors-accelerometer" title="Accelerometer" status={accelerometerStatus}>
          {accelerometer && <AxisReadingRow measurement={accelerometer} />}
        </SensorCard>

        <SensorCard testID="sensors-gyroscope" title="Gyroscope" status={gyroscopeStatus}>
          {gyroscope && <AxisReadingRow measurement={gyroscope} />}
        </SensorCard>

        <SensorCard testID="sensors-magnetometer" title="Magnetometer" status={magnetometerStatus}>
          {magnetometer && <AxisReadingRow measurement={magnetometer} />}
        </SensorCard>

        <SensorCard testID="sensors-device-motion" title="Device motion" status={deviceMotionStatus}>
          {deviceMotion && (
            <Text className="info-text">{`interval: ${deviceMotion.interval.toFixed(1)}ms`}</Text>
          )}
          {deviceMotion?.rotation && (
            <View className="sensor-reading-row">
              <View className="sensor-reading-chip">
                <Text className="sensor-reading-label">ALPHA</Text>
                <Text className="sensor-reading-value">{deviceMotion.rotation.alpha.toFixed(3)}</Text>
              </View>
              <View className="sensor-reading-chip">
                <Text className="sensor-reading-label">BETA</Text>
                <Text className="sensor-reading-value">{deviceMotion.rotation.beta.toFixed(3)}</Text>
              </View>
              <View className="sensor-reading-chip">
                <Text className="sensor-reading-label">GAMMA</Text>
                <Text className="sensor-reading-value">{deviceMotion.rotation.gamma.toFixed(3)}</Text>
              </View>
            </View>
          )}
        </SensorCard>

        <SensorCard testID="sensors-pedometer" title="Pedometer" status={pedometerStatus}>
          {pedometer && (
            <Text testID="sensors-pedometer-steps" className="sensor-reading-value">
              {`${pedometer.steps} steps`}
            </Text>
          )}
        </SensorCard>
      </ScrollView>
    </SafeAreaView>
  );
}
