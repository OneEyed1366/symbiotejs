import type { ISymbioteEvent } from '@symbiote-native/react';

export function firstTouchX(event: ISymbioteEvent): number {
  const touches = event.nativeEvent.touches;
  if (!Array.isArray(touches) || touches.length === 0) return 0;
  const first: unknown = touches[0];
  if (typeof first === 'object' && first !== null && 'pageX' in first) {
    const pageX = first.pageX;
    return typeof pageX === 'number' ? pageX : 0;
  }
  return 0;
}

// nativeEvent is a framework-agnostic Record<string, unknown>, so a numeric field
// (locationX/locationY…) arrives untyped, narrow it here instead of casting.
export function nativeNumber(event: ISymbioteEvent, key: string): number {
  const value = event.nativeEvent[key];
  return typeof value === 'number' ? value : 0;
}
