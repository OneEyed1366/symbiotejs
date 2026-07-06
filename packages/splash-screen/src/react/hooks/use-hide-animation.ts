// React lifecycle wiring over the framework-agnostic HideAnimationController + style
// computation (core/) — mirrors the lifecycle-bucket naming convention of
// adapters/react/src/hooks. Faithful port of react-native-bootsplash's own useHideAnimation:
// the controller is constructed lazily ONCE (a useRef factory, never reconstructed across
// re-renders), native constants are read once via useState's lazy initializer (they never
// change), and an effect with NO dependency array re-syncs the controller's config after
// EVERY render — intentional, since `ready` flipping true only gets picked up this way.
//
// No useMemo around the style computation: upstream lists ~15 individual primitive fields
// (manifest.logo.width, backgroundColor, ...) as its memo's deps specifically so Object.is
// compares by VALUE, not by the `config`/`manifest` object's reference — callers construct
// that object fresh on every render (the normal way to call this hook), so keying a memo off
// the whole object would recompute every render anyway while looking like it memoizes.
// Reproducing the fine-grained list isn't worth it for a splash screen shown for a couple of
// renders at boot; computing plainly is honest about the actual cost and simpler to read.
import { useEffect, useRef, useState } from 'react';
import {
  computeHideAnimationStyles,
  getHideAnimationConstants,
  HideAnimationController,
  type IHideAnimationConfig,
  type IHideAnimationConstants,
  type IHideAnimationResult,
} from '../../core';

export function useHideAnimation(config: IHideAnimationConfig): IHideAnimationResult {
  const controllerRef = useRef<HideAnimationController | null>(null);
  if (controllerRef.current == null) {
    controllerRef.current = new HideAnimationController(config);
  }
  const controller = controllerRef.current;

  const [constants] = useState<IHideAnimationConstants>(() => getHideAnimationConstants());

  useEffect(() => {
    controller.updateConfig(config);
  });

  return computeHideAnimationStyles(config, constants, controller);
}
