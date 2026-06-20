// useWindowDimensions — the preferred API for components that need window metrics,
// a faithful port of RN's Libraries/Utilities/useWindowDimensions.js. It seeds from
// Dimensions.get('window'), subscribes to 'change', and re-checks once after
// subscribing to close the gap between the render-time get and the effect-time
// listener. Only the window metrics changing triggers a re-render.

import { useEffect, useState } from 'react'
import { Dimensions, type DimensionsSet, type DisplayMetrics } from './dimensions'

export function useWindowDimensions(): DisplayMetrics {
  const [dimensions, setDimensions] = useState<DisplayMetrics>(() => Dimensions.get('window'))

  useEffect(() => {
    function handleChange(window: DisplayMetrics): void {
      if (
        dimensions.width !== window.width ||
        dimensions.height !== window.height ||
        dimensions.scale !== window.scale ||
        dimensions.fontScale !== window.fontScale
      ) {
        setDimensions(window)
      }
    }

    const subscription = Dimensions.addEventListener('change', (set: DimensionsSet) => {
      handleChange(set.window)
    })
    // We may have missed an update between calling `get` in render and subscribing
    // here; re-check now. If nothing changed, React filters the no-op set.
    handleChange(Dimensions.get('window'))
    return () => {
      subscription.remove()
    }
  }, [dimensions])

  return dimensions
}
