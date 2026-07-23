// React lifecycle wiring over the framework-agnostic Gyroscope singleton (core/) —
// mirrors the lifecycle-bucket naming convention of adapters/react/src/hooks.
import { useEffect, useState } from 'react';
import { Gyroscope, type IGyroscopeMeasurement } from '../../../core';

export function useGyroscope(updateIntervalMs?: number): IGyroscopeMeasurement | null {
  const [measurement, setMeasurement] = useState<IGyroscopeMeasurement | null>(null);

  useEffect(() => {
    // Re-subscribing on interval change keeps the native update rate in sync with the
    // caller's latest `updateIntervalMs` rather than only ever honoring the first mount's.
    if (updateIntervalMs !== undefined) {
      Gyroscope.setUpdateInterval(updateIntervalMs);
    }

    const subscription = Gyroscope.addListener(setMeasurement);
    return () => subscription.remove();
  }, [updateIntervalMs]);

  return measurement;
}
