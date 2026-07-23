// React lifecycle wiring over the framework-agnostic Barometer singleton (core/) —
// mirrors the lifecycle-bucket naming convention of adapters/react/src/hooks.
import { useEffect, useState } from 'react';
import { Barometer, type IBarometerMeasurement } from '../../../core';

export function useBarometer(updateIntervalMs?: number): IBarometerMeasurement | null {
  const [measurement, setMeasurement] = useState<IBarometerMeasurement | null>(null);

  useEffect(() => {
    // Re-subscribing on interval change keeps the native update rate in sync with the
    // caller's latest `updateIntervalMs` rather than only ever honoring the first mount's.
    if (updateIntervalMs !== undefined) {
      Barometer.setUpdateInterval(updateIntervalMs);
    }

    const subscription = Barometer.addListener(setMeasurement);
    return () => subscription.remove();
  }, [updateIntervalMs]);

  return measurement;
}
