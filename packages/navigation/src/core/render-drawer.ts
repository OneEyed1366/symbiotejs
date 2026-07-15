// Drawer: the render half (framework-agnostic). Like render-stack.ts's screen content, both the
// drawer panel's content (renderDrawerContent) and the wrapped screen content are arbitrary
// framework subtrees the adapter owns - so, mirroring render-modal.ts's container-slot precedent,
// renderDrawer hands back one root Descriptor whose structural children are EMPTY placeholder
// nodes (`content` / `overlay?` / `panel`) that the adapter fills with real framework children.
// Paint order (and therefore which slot is present) is drawerType-dependent, so `drawerChildOrder`
// is exported alongside renderDrawer as the single source of truth the adapter zips its own
// children against - no adapter re-derives the ordering itself.
//
// All positioning here is STATIC (position/top/bottom/side/width) - the animated slide transform
// and overlay opacity are NOT baked into this Descriptor. They are computed once per drawerType
// via drawer-options.ts's resolveDrawerGeometry() and then driven per-frame by the adapter's own
// Animated value (Animated.View), because "how to animate a style" is a framework-lifecycle
// concern (React: Animated.View; a future Vue adapter: a reactive style binding) - see
// CLAUDE.md <adapters_stay_thin>.

import { el, type IDescriptor } from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import {
  isDrawerOverlayVisible,
  resolveDrawerPosition,
  resolveDrawerType,
  resolveDrawerWidth,
  type IDrawerOptions,
} from './drawer-options';

export type IDrawerSlot = 'content' | 'overlay' | 'panel';

// front: content, overlay (dims it), panel (paints on top, last-sibling-on-top).
// back: panel (stationary, behind), content (slides away to reveal it) - no overlay. Both are
// absolutely positioned, so sibling order here only decides z-stacking, not screen side.
// slide: panel, overlay, content (both panel and content animate; content stays visually on top).
// permanent: NOT absolutely positioned (an ordinary flexDirection:'row' sidebar), so sibling
// order IS the left-to-right screen position - it must follow drawerPosition.
export function drawerChildOrder(options: IDrawerOptions): readonly IDrawerSlot[] {
  const type = resolveDrawerType(options);
  switch (type) {
    case 'back':
      return ['panel', 'content'];
    case 'slide':
      return ['panel', 'overlay', 'content'];
    case 'permanent':
      return resolveDrawerPosition(options) === 'left'
        ? ['panel', 'content']
        : ['content', 'panel'];
    case 'front':
    default:
      return ['content', 'overlay', 'panel'];
  }
}

export type IDrawerViewProps = {
  overlayColor?: string;
  drawerStyle?: IStyleProp<IViewStyle>;
  contentPassthrough: Record<string, unknown>;
  overlayPassthrough: Record<string, unknown>;
  panelPassthrough: Record<string, unknown>;
};

const ROOT_STYLE: Readonly<IViewStyle> = { flex: 1 };
const CONTENT_STYLE: Readonly<IViewStyle> = { flex: 1 };
// Fabric paints later siblings on top; position:absolute + inset:0 is enough for the overlay
// (its own sibling order, not zIndex, decides whether it sits above the content).
const OVERLAY_BASE_STYLE: Readonly<IViewStyle> = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const DRAWER_PANEL_DEFAULT_BACKGROUND_COLOR = 'white';

function panelBaseStyle(options: IDrawerOptions): IViewStyle {
  const type = resolveDrawerType(options);
  const width = resolveDrawerWidth(options);
  const side = resolveDrawerPosition(options);
  if (type === 'permanent') {
    // A sidebar: an ordinary flex child, no absolute positioning, no translate needed.
    return { width, backgroundColor: DRAWER_PANEL_DEFAULT_BACKGROUND_COLOR };
  }
  return {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width,
    backgroundColor: DRAWER_PANEL_DEFAULT_BACKGROUND_COLOR,
    [side]: 0,
  };
}

export function renderDrawer(view: IDrawerViewProps, options: IDrawerOptions): IDescriptor {
  const type = resolveDrawerType(options);
  const content = el('symbiote-view', { ...view.contentPassthrough, style: CONTENT_STYLE }, []);
  const panel = el(
    'symbiote-view',
    { ...view.panelPassthrough, style: [panelBaseStyle(options), view.drawerStyle] },
    [],
  );

  const slots: Partial<Record<IDrawerSlot, IDescriptor>> = { content, panel };
  if (isDrawerOverlayVisible(options)) {
    slots.overlay = el(
      'symbiote-view',
      {
        ...view.overlayPassthrough,
        style: [OVERLAY_BASE_STYLE, { backgroundColor: view.overlayColor }],
      },
      [],
    );
  }

  const children = drawerChildOrder(options).reduce<IDescriptor[]>((acc, slot) => {
    const descriptor = slots[slot];
    if (descriptor !== undefined) acc.push(descriptor);
    return acc;
  }, []);

  const rootStyle: IViewStyle =
    type === 'permanent' ? { ...ROOT_STYLE, flexDirection: 'row' } : ROOT_STYLE;

  return el('symbiote-view', { style: rootStyle }, children);
}
