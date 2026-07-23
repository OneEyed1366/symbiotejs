// React lifecycle wiring over the framework-agnostic DeviceMotion singleton (core/) —
// mirrors the lifecycle-bucket naming convention of adapters/react/src/hooks.
import { useEffect, useState } from 'react';
import { DeviceMotion, type IDeviceMotionMeasurement } from '../../../core';

export function useDeviceMotion(updateIntervalMs?: number): IDeviceMotionMeasurement | null {
  const [measurement, setMeasurement] = useState<IDeviceMotionMeasurement | null>(null);

  useEffect(() => {
    // Re-subscribing on interval change keeps the native update rate in sync with the
    // caller's latest `updateIntervalMs` rather than only ever honoring the first mount's.
    if (updateIntervalMs !== undefined) {
      DeviceMotion.setUpdateInterval(updateIntervalMs);
    }

    const subscription = DeviceMotion.addListener(setMeasurement);
    return () => subscription.remove();
  }, [updateIntervalMs]);

  return measurement;
}
