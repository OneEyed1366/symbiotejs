// Shared across render-scroll-view's content/frame dimension read (width/height) and
// render-scroll-sticky's header position read (y/height): both pull a single numeric field out of
// an onLayout event's nativeEvent.layout. SymbioteEvent.nativeEvent is Record<string, unknown>, so
// the layout box and the requested field are narrowed at runtime, no cast. A malformed event
// yields undefined (no-op).

import type { ISymbioteEvent } from '@symbiote-native/engine';

export function readLayoutField(
  event: ISymbioteEvent,
  key: 'width' | 'height' | 'y',
): number | undefined {
  const layout = event.nativeEvent.layout;
  if (typeof layout !== 'object' || layout === null) return undefined;
  const value = Reflect.get(layout, key);
  return typeof value === 'number' ? value : undefined;
}
