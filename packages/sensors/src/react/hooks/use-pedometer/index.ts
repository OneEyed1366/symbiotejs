// React lifecycle wiring over the framework-agnostic watchStepCount free function (core/) —
// mirrors the lifecycle-bucket naming convention of adapters/react/src/hooks. Unlike
// useAccelerometer, Pedometer has no setUpdateInterval, so there is no updateIntervalMs param
// to sync on re-render.
import { useEffect, useState } from 'react';
import { watchStepCount, type IPedometerResult } from '../../../core';

export function usePedometer(): IPedometerResult | null {
  const [result, setResult] = useState<IPedometerResult | null>(null);

  useEffect(() => {
    const subscription = watchStepCount(setResult);
    return () => subscription.remove();
  }, []);

  return result;
}
