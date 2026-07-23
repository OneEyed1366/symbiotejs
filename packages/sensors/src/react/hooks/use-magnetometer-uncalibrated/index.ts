// React lifecycle wiring over the framework-agnostic MagnetometerUncalibrated singleton
// (core/) — mirrors the lifecycle-bucket naming convention of adapters/react/src/hooks.
import { useEffect, useState } from 'react';
import { MagnetometerUncalibrated, type IMagnetometerUncalibratedMeasurement } from '../../../core';

export function useMagnetometerUncalibrated(
  updateIntervalMs?: number,
): IMagnetometerUncalibratedMeasurement | null {
  const [measurement, setMeasurement] = useState<IMagnetometerUncalibratedMeasurement | null>(null);

  useEffect(() => {
    // Re-subscribing on interval change keeps the native update rate in sync with the
    // caller's latest `updateIntervalMs` rather than only ever honoring the first mount's.
    if (updateIntervalMs !== undefined) {
      MagnetometerUncalibrated.setUpdateInterval(updateIntervalMs);
    }

    const subscription = MagnetometerUncalibrated.addListener(setMeasurement);
    return () => subscription.remove();
  }, [updateIntervalMs]);

  return measurement;
}
