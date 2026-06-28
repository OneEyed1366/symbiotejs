// useWindowDimensions is the preferred API for components that need window metrics,
// a port of RN's Libraries/Utilities/useWindowDimensions.js. It seeds from
// Dimensions.get('window'), subscribes to 'change', and re-checks once after
// subscribing to close the gap between the render-time get and the effect-time
// listener. Only the window metrics changing triggers a re-render.

import { useEffect, useState } from 'react';
import { Dimensions, type IDimensionsSet, type IDisplayMetrics } from './dimensions';

export function useWindowDimensions(): IDisplayMetrics {
  const [dimensions, setDimensions] = useState<IDisplayMetrics>(() => Dimensions.get('window'));

  useEffect(() => {
    function handleChange(window: IDisplayMetrics): void {
      if (
        dimensions.width !== window.width ||
        dimensions.height !== window.height ||
        dimensions.scale !== window.scale ||
        dimensions.fontScale !== window.fontScale
      ) {
        setDimensions(window);
      }
    }

    const subscription = Dimensions.addEventListener('change', (set: IDimensionsSet) => {
      handleChange(set.window);
    });
    // We may have missed an update between calling `get` in render and subscribing
    // here; re-check now. If nothing changed, React filters the no-op set.
    handleChange(Dimensions.get('window'));
    return () => {
      subscription.remove();
    };
  }, [dimensions]);

  return dimensions;
}
