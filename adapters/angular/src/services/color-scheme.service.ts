import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Appearance, type IColorSchemeName } from '@symbiotejs/engine';

/**
 * Angular twin of React's `useColorScheme` and Vue's `useColorScheme` composable. The service
 * holds a Signal that tracks the device color scheme; consumers read it via `inject`:
 *
 *   readonly colorScheme = inject(ColorSchemeService).colorScheme;
 *
 * State and lifecycle live in DI, not in a function closure.
 */
@Injectable({ providedIn: 'root' })
export class ColorSchemeService {
  readonly colorScheme = signal<IColorSchemeName | null>(Appearance.getColorScheme());

  constructor() {
    const destroyRef = inject(DestroyRef);

    const subscription = Appearance.addChangeListener(preferences => {
      this.colorScheme.set(preferences.colorScheme);
    });

    destroyRef.onDestroy(() => {
      subscription.remove();
    });
  }
}
