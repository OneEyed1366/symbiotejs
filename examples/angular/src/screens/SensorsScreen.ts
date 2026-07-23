import { Component, Injector, Signal, effect, inject, signal } from '@angular/core';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { SafeAreaView, ScrollView, SymbioteHostPropsDirective, Text, View } from '@symbiote-native/angular';
import {
  AccelerometerService,
  DeviceMotionService,
  GyroscopeService,
  MagnetometerService,
  PedometerService,
  isAvailableAsync as isPedometerAvailableAsync,
  type IAccelerometerMeasurement,
  type IDeviceMotionMeasurement,
  type IGyroscopeMeasurement,
  type IMagnetometerMeasurement,
  type IPedometerResult,
} from '@symbiote-native/sensors/angular';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// packages/sensors/src/angular/index.ts re-exports each *Service.connect() signal plus, for
// Pedometer only, the free isAvailableAsync() function — the DeviceSensor-based classes
// (Accelerometer/Gyroscope/Magnetometer/DeviceMotion) don't expose their own isAvailableAsync()
// through the Angular package barrel. So for those four, probe expo-modules-core's own
// requireOptionalNativeModule() directly, by the same native module name the wrapper itself
// resolves (packages/sensors/src/core/native/exponent-*.ts) — a real availability answer
// without reaching for an unexported symbol.
const NATIVE_MODULE_NAME = {
  Accelerometer: 'ExponentAccelerometer',
  Gyroscope: 'ExponentGyroscope',
  Magnetometer: 'ExponentMagnetometer',
  DeviceMotion: 'ExponentDeviceMotion',
} as const;

type INativeSensorProbe = {
  isAvailableAsync?: () => Promise<boolean>;
};

function probeNativeAvailability(nativeModuleName: string): Promise<boolean> {
  const nativeModule = requireOptionalNativeModule<INativeSensorProbe>(nativeModuleName);
  if (!nativeModule?.isAvailableAsync) {
    return Promise.resolve(false);
  }
  return nativeModule.isAvailableAsync();
}

// 4 distinct render states, never collapsed into each other (frontend-ux-best-practices'
// async-state rule) — "not available on this device" and "waiting for first reading" look
// identical from the JS side (a subscription to an unavailable sensor never throws, it just
// never fires) unless the availability check runs separately, which is exactly what this
// status signal does. Angular twin of ../../react/screens/SensorsScreen.tsx's ISensorStatus —
// same 4 states, same status-badge/reading-chip visual, React being this repo's "prove the
// pattern first" adapter for this package.
type ISensorCardStatus = 'checking' | 'unavailable' | 'waiting' | 'live';

const SENSOR_STATUS_TEXT: Record<ISensorCardStatus, string> = {
  checking: 'CHECKING…',
  unavailable: 'UNAVAILABLE',
  waiting: 'WAITING…',
  live: 'LIVE',
};

function sensorCardStatus<Measurement>(
  measurement: Signal<Measurement | null>,
  checkAvailability: () => Promise<boolean>,
  injector: Injector,
): Signal<ISensorCardStatus> {
  const status = signal<ISensorCardStatus>('checking');

  checkAvailability().then(available => {
    if (!available) {
      status.set('unavailable');
    } else if (status() === 'checking') {
      status.set('waiting');
    }
  });

  effect(
    () => {
      if (measurement() !== null && status() !== 'unavailable') {
        status.set('live');
      }
    },
    { injector },
  );

  return status.asReadonly();
}

// testID isn't a declared @Input() on View/Text (adapters/angular/src/primitives/shared.ts) — a
// bound [testID] fails NG8002 under examples/angular/tsconfig.angular.json's strictTemplates:
// true real ngc build, even though it works at runtime and under vitest's JIT compilation (see
// ../components/ResponderDemo.ts). Precomputed once per card, same as ResponderDemo's chip
// hostProps, rather than allocated fresh in the template on every change-detection pass.
function sensorCardHostProps(id: string): Record<string, unknown> {
  return { testID: `sensor-card-${id}` };
}

function sensorStatusHostProps(id: string): Record<string, unknown> {
  return { testID: `sensor-status-${id}` };
}

type IAxisReading = { x: number; y: number; z: number };

type IAxisSensorCard = {
  id: string;
  title: string;
  status: Signal<ISensorCardStatus>;
  reading: Signal<IAxisReading | null>;
  cardHostProps: Record<string, unknown>;
  statusHostProps: Record<string, unknown>;
};

/**
 * Sensors demo: one card per @symbiote-native/sensors sensor (Accelerometer, Gyroscope,
 * Magnetometer, DeviceMotion, Pedometer), each backed by its own Angular service's connect()
 * signal. iOS Simulator genuinely reports every CoreMotion/CMPedometer sensor as unavailable —
 * expected, not a bug (see packages/sensors/README.md's Notes section); a real device is
 * needed to see the "live" state. Angular twin of ../../react/screens/SensorsScreen.tsx — same
 * 4-state card (checking/unavailable/waiting/live) and X/Y/Z reading-chip layout, React being
 * this repo's "prove the pattern first" adapter for this package.
 */
@Component({
  selector: 'SensorsScreen',
  standalone: true,
  imports: [SafeAreaView, ScrollView, SymbioteHostPropsDirective, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="sensors-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">SN</Text>
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

        @for (card of axisCards; track card.id) {
          <View [symbioteHostProps]="card.cardHostProps" class="sensor-card">
            <View class="sensor-card-header">
              <Text class="sensor-card-title">{{ card.title }}</Text>
              <View [symbioteHostProps]="card.statusHostProps" [class]="statusBadgeClass(card.status())">
                <Text class="sensor-status-text">{{ statusLabel(card.status()) }}</Text>
              </View>
            </View>
            @switch (card.status()) {
              @case ('checking') {
                <Text class="info-text">checking availability…</Text>
              }
              @case ('unavailable') {
                <Text class="info-text">not available on this device</Text>
              }
              @case ('waiting') {
                <Text class="info-text">waiting for first reading…</Text>
              }
              @case ('live') {
                @if (card.reading(); as reading) {
                  <View class="sensor-reading-row">
                    <View class="sensor-reading-chip">
                      <Text class="sensor-reading-label">X</Text>
                      <Text class="sensor-reading-value">{{ reading.x.toFixed(3) }}</Text>
                    </View>
                    <View class="sensor-reading-chip">
                      <Text class="sensor-reading-label">Y</Text>
                      <Text class="sensor-reading-value">{{ reading.y.toFixed(3) }}</Text>
                    </View>
                    <View class="sensor-reading-chip">
                      <Text class="sensor-reading-label">Z</Text>
                      <Text class="sensor-reading-value">{{ reading.z.toFixed(3) }}</Text>
                    </View>
                  </View>
                }
              }
            }
          </View>
        }

        <View testID="sensor-card-device-motion" class="sensor-card">
          <View class="sensor-card-header">
            <Text class="sensor-card-title">Device motion</Text>
            <View testID="sensor-status-device-motion" [class]="statusBadgeClass(deviceMotionStatus())">
              <Text class="sensor-status-text">{{ statusLabel(deviceMotionStatus()) }}</Text>
            </View>
          </View>
          @switch (deviceMotionStatus()) {
            @case ('checking') {
              <Text class="info-text">checking availability…</Text>
            }
            @case ('unavailable') {
              <Text class="info-text">not available on this device</Text>
            }
            @case ('waiting') {
              <Text class="info-text">waiting for first reading…</Text>
            }
            @case ('live') {
              @if (deviceMotion(); as motion) {
                <Text class="info-text">{{ 'interval: ' + motion.interval.toFixed(1) + 'ms' }}</Text>
                @if (motion.rotation; as rotation) {
                  <View class="sensor-reading-row">
                    <View class="sensor-reading-chip">
                      <Text class="sensor-reading-label">ALPHA</Text>
                      <Text class="sensor-reading-value">{{ rotation.alpha.toFixed(3) }}</Text>
                    </View>
                    <View class="sensor-reading-chip">
                      <Text class="sensor-reading-label">BETA</Text>
                      <Text class="sensor-reading-value">{{ rotation.beta.toFixed(3) }}</Text>
                    </View>
                    <View class="sensor-reading-chip">
                      <Text class="sensor-reading-label">GAMMA</Text>
                      <Text class="sensor-reading-value">{{ rotation.gamma.toFixed(3) }}</Text>
                    </View>
                  </View>
                }
              }
            }
          }
        </View>

        <View testID="sensor-card-pedometer" class="sensor-card">
          <View class="sensor-card-header">
            <Text class="sensor-card-title">Pedometer</Text>
            <View testID="sensor-status-pedometer" [class]="statusBadgeClass(pedometerStatus())">
              <Text class="sensor-status-text">{{ statusLabel(pedometerStatus()) }}</Text>
            </View>
          </View>
          @switch (pedometerStatus()) {
            @case ('checking') {
              <Text class="info-text">checking availability…</Text>
            }
            @case ('unavailable') {
              <Text class="info-text">not available on this device</Text>
            }
            @case ('waiting') {
              <Text class="info-text">waiting for first reading…</Text>
            }
            @case ('live') {
              @if (pedometer(); as steps) {
                <Text testID="sensors-pedometer-steps" class="sensor-reading-value">
                  {{ steps.steps + ' steps' }}
                </Text>
              }
            }
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class SensorsScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.sensors };

  private readonly injector = inject(Injector);

  private readonly accelerometer: Signal<IAccelerometerMeasurement | null> = inject(AccelerometerService).connect();
  private readonly gyroscope: Signal<IGyroscopeMeasurement | null> = inject(GyroscopeService).connect();
  private readonly magnetometer: Signal<IMagnetometerMeasurement | null> = inject(MagnetometerService).connect();
  readonly deviceMotion: Signal<IDeviceMotionMeasurement | null> = inject(DeviceMotionService).connect();
  readonly pedometer: Signal<IPedometerResult | null> = inject(PedometerService).connect();

  readonly deviceMotionStatus = sensorCardStatus(
    this.deviceMotion,
    () => probeNativeAvailability(NATIVE_MODULE_NAME.DeviceMotion),
    this.injector,
  );
  readonly pedometerStatus = sensorCardStatus(this.pedometer, () => isPedometerAvailableAsync(), this.injector);

  readonly axisCards: IAxisSensorCard[] = [
    {
      id: 'accelerometer',
      title: 'Accelerometer',
      status: sensorCardStatus(
        this.accelerometer,
        () => probeNativeAvailability(NATIVE_MODULE_NAME.Accelerometer),
        this.injector,
      ),
      reading: this.accelerometer,
      cardHostProps: sensorCardHostProps('accelerometer'),
      statusHostProps: sensorStatusHostProps('accelerometer'),
    },
    {
      id: 'gyroscope',
      title: 'Gyroscope',
      status: sensorCardStatus(
        this.gyroscope,
        () => probeNativeAvailability(NATIVE_MODULE_NAME.Gyroscope),
        this.injector,
      ),
      reading: this.gyroscope,
      cardHostProps: sensorCardHostProps('gyroscope'),
      statusHostProps: sensorStatusHostProps('gyroscope'),
    },
    {
      id: 'magnetometer',
      title: 'Magnetometer',
      status: sensorCardStatus(
        this.magnetometer,
        () => probeNativeAvailability(NATIVE_MODULE_NAME.Magnetometer),
        this.injector,
      ),
      reading: this.magnetometer,
      cardHostProps: sensorCardHostProps('magnetometer'),
      statusHostProps: sensorStatusHostProps('magnetometer'),
    },
  ];

  statusBadgeClass(status: ISensorCardStatus): string {
    return `sensor-status-badge sensor-status-badge-${status}`;
  }

  statusLabel(status: ISensorCardStatus): string {
    return SENSOR_STATUS_TEXT[status];
  }
}
