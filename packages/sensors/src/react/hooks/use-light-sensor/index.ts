// React lifecycle wiring over the framework-agnostic LightSensor singleton (core/) —
// mirrors the lifecycle-bucket naming convention of adapters/react/src/hooks.
import { useEffect, useState } from 'react';
import { LightSensor, type ILightSensorMeasurement } from '../../../core';

export function useLightSensor(updateIntervalMs?: number): ILightSensorMeasurement | null {
  const [measurement, setMeasurement] = useState<ILightSensorMeasurement | null>(null);

  useEffect(() => {
    // Re-subscribing on interval change keeps the native update rate in sync with the
    // caller's latest `updateIntervalMs` rather than only ever honoring the first mount's.
    if (updateIntervalMs !== undefined) {
      LightSensor.setUpdateInterval(updateIntervalMs);
    }

    const subscription = LightSensor.addListener(setMeasurement);
    return () => subscription.remove();
  }, [updateIntervalMs]);

  return measurement;
}
