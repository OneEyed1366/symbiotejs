// React lifecycle wiring over the framework-agnostic Accelerometer singleton (core/) —
// mirrors the lifecycle-bucket naming convention of adapters/react/src/hooks.
import { useEffect, useState } from 'react';
import { Accelerometer, type IAccelerometerMeasurement } from '../../../core';

export function useAccelerometer(updateIntervalMs?: number): IAccelerometerMeasurement | null {
  const [measurement, setMeasurement] = useState<IAccelerometerMeasurement | null>(null);

  useEffect(() => {
    // Re-subscribing on interval change keeps the native update rate in sync with the
    // caller's latest `updateIntervalMs` rather than only ever honoring the first mount's.
    if (updateIntervalMs !== undefined) {
      Accelerometer.setUpdateInterval(updateIntervalMs);
    }

    const subscription = Accelerometer.addListener(setMeasurement);
    return () => subscription.remove();
  }, [updateIntervalMs]);

  return measurement;
}
