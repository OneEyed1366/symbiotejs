// useColorScheme — subscribes a component to the device color scheme and re-renders
// on change. Mirrors RN's Libraries/Utilities/useColorScheme.js: a thin
// useSyncExternalStore over Appearance's change event + current scheme read.

import { useSyncExternalStore } from 'react'

import { Appearance, type ColorSchemeName } from './appearance'

const subscribe = (onStoreChange: () => void): (() => void) => {
  const subscription = Appearance.addChangeListener(onStoreChange)
  return () => subscription.remove()
}

const getSnapshot = (): ColorSchemeName | null => Appearance.getColorScheme()

export function useColorScheme(): ColorSchemeName | null {
  return useSyncExternalStore(subscribe, getSnapshot)
}
