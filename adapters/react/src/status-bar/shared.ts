// StatusBar is the React-side contract. The pure types + the imperative API + applyStatusBarProps
// live in @symbiote/engine (shared verbatim with every adapter); React supplies only the
// declarative component shape: an FC that renders null and applies the props in an effect, with
// the imperative statics attached to the function object (RN's StatusBar). IStatusBarComponent
// is the one React-coupled type (it names React's FC), so it stays here, not in the engine.

import type { FC } from 'react';
import type { IStatusBarImperative, IStatusBarProps } from '@symbiote/engine';
export type { IStatusBarProps, IStatusBarStyle, IStatusBarAnimation } from '@symbiote/engine';

// The declarative component plus the imperative surface, mirroring RN. currentHeight is
// Android-only; on iOS it is absent (RN sets it to null), so it stays optional on the contract.
export interface IStatusBarComponent extends FC<IStatusBarProps>, IStatusBarImperative {
  currentHeight?: number;
}
