// React lifecycle wiring over the framework-agnostic Magnetometer singleton (core/) —
// mirrors the lifecycle-bucket naming convention of adapters/react/src/hooks.
import { useEffect, useState } from 'react';
import { Magnetometer, type IMagnetometerMeasurement } from '../../../core';

export function useMagnetometer(updateIntervalMs?: number): IMagnetometerMeasurement | null {
  const [measurement, setMeasurement] = useState<IMagnetometerMeasurement | null>(null);

  useEffect(() => {
    // Re-subscribing on interval change keeps the native update rate in sync with the
    // caller's latest `updateIntervalMs` rather than only ever honoring the first mount's.
    if (updateIntervalMs !== undefined) {
      Magnetometer.setUpdateInterval(updateIntervalMs);
    }

    const subscription = Magnetometer.addListener(setMeasurement);
    return () => subscription.remove();
  }, [updateIntervalMs]);

  return measurement;
}
