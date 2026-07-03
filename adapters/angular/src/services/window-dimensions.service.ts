import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Dimensions, type IDimensionsSet, type IDisplayMetrics } from '@symbiotejs/engine';

/**
 * Angular twin of React's `useWindowDimensions` and Vue's `useWindowDimensions` composable. The
 * service holds a Signal that tracks window metrics; consumers read it via `inject`:
 *
 *   readonly dimensions = inject(WindowDimensionsService).dimensions;
 *
 * State and lifecycle live in DI, not in a function closure.
 */
@Injectable({ providedIn: 'root' })
export class WindowDimensionsService {
  readonly dimensions = signal<IDisplayMetrics>(Dimensions.get('window'));

  constructor() {
    const destroyRef = inject(DestroyRef);

    const handleChange = (window: IDisplayMetrics): void => {
      const current = this.dimensions();
      if (
        current.width !== window.width ||
        current.height !== window.height ||
        current.scale !== window.scale ||
        current.fontScale !== window.fontScale
      ) {
        this.dimensions.set(window);
      }
    };

    const subscription = Dimensions.addEventListener('change', (set: IDimensionsSet) => {
      handleChange(set.window);
    });
    // Re-check once after subscribing to close the gap between construction and the listener.
    handleChange(Dimensions.get('window'));

    destroyRef.onDestroy(() => {
      subscription.remove();
    });
  }
}
