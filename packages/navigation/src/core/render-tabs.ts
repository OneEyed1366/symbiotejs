// TabBar: the render half (framework-agnostic). A bottom-tabs bar is a PURE-JS UI - unlike
// Stack, which drives real native RNSScreen/RNSScreenStack views, this paints ordinary
// `symbiote-view`/`symbiote-text` primitives, so it needs no react-native-screens ViewConfig
// work at all (see the task brief in packages/navigation's skill notes). Mirrors renderSwitch's
// shape: pure prop-driven functions building a `Descriptor` tree from pre-resolved view props;
// the adapter supplies focus state, tint-color resolution inputs, and the press wiring via
// `passthrough` (exactly like Stack wires onDismissed/onHeaderBackButtonClicked into
// resolveScreenView's passthrough) - this layer never invents an onPress/responder pair itself.

import { el, txt } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import type { IColorValue, IViewStyle, ITextStyle, IStyleProp } from '@symbiote-native/engine';
import type { ITabBarIcon } from './tab-options';

// react-navigation's own bottom-tabs default to the surrounding theme's primary/text colors;
// symbiote's navigation package has no app-level theme yet, so these are placeholder defaults -
// the same iOS-system-blue/neutral-grey pair render-button.ts already uses for its default
// tint/disabled colors, reused here rather than inventing a third pair (no shared semantic color
// tokens exist yet in @symbiote-native/engine as of this writing).
const DEFAULT_ACTIVE_TINT_COLOR = '#007AFF';
const DEFAULT_INACTIVE_TINT_COLOR = '#8e8e93';
const BADGE_BACKGROUND_COLOR = '#FF3B30';
const BADGE_TEXT_COLOR = '#ffffff';

const TAB_BAR_HEIGHT = 49;
const TAB_ICON_FONT_SIZE = 20;
const TAB_LABEL_FONT_SIZE = 10;
const BADGE_SIZE = 16;
const BADGE_BORDER_RADIUS = BADGE_SIZE / 2;
const BADGE_OFFSET_TOP = -4;
const BADGE_OFFSET_RIGHT = -8;

// One tab item's pre-resolved paint inputs. `label`/`icon`/`badge`/tint colors are already
// folded from the route's ITabOptions by the adapter (same split as IScreenViewProps); `focused`
// decides which tint applies. `passthrough` carries the tap wiring (a plain `onPress`, which the
// engine synthesizes from a touchStart/touchEnd pair on the node - core/engine/src/events/index.ts
// - no responder-negotiation props needed) plus accessibility/testID.
export type ITabBarItemView = {
  key: string;
  focused: boolean;
  label: string;
  icon?: ITabBarIcon;
  badge?: string | number;
  activeTintColor?: IColorValue;
  inactiveTintColor?: IColorValue;
  passthrough: Record<string, unknown>;
};

export type ITabBarViewProps = {
  items: readonly ITabBarItemView[];
  style?: IStyleProp<IViewStyle>;
  passthrough: Record<string, unknown>;
};

const TAB_BAR_STYLE: IViewStyle = {
  flexDirection: 'row',
  height: TAB_BAR_HEIGHT,
};

const TAB_ITEM_STYLE: IViewStyle = {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
};

const ICON_WRAPPER_STYLE: IViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
};

const BADGE_STYLE: IViewStyle = {
  position: 'absolute',
  top: BADGE_OFFSET_TOP,
  right: BADGE_OFFSET_RIGHT,
  minWidth: BADGE_SIZE,
  height: BADGE_SIZE,
  borderRadius: BADGE_BORDER_RADIUS,
  backgroundColor: BADGE_BACKGROUND_COLOR,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 3,
};

const BADGE_TEXT_STYLE: ITextStyle = {
  color: BADGE_TEXT_COLOR,
  fontSize: 8,
  fontWeight: '600',
};

function resolveTintColor(item: ITabBarItemView): IColorValue {
  if (item.focused) return item.activeTintColor ?? DEFAULT_ACTIVE_TINT_COLOR;
  return item.inactiveTintColor ?? DEFAULT_INACTIVE_TINT_COLOR;
}

// A string icon paints as a glyph (an emoji/ligature font name - same convention a caller uses
// for a vector-icon-font label); an IDescriptor icon (an <Image>/vector-icon element the adapter
// already resolved) is spliced in verbatim, exactly like renderHeaderConfig treats a pre-built
// Descriptor child.
function renderIcon(icon: ITabBarIcon | undefined, color: IColorValue): IDescriptor | undefined {
  if (icon === undefined) return undefined;
  if (typeof icon === 'string')
    return txt({ style: { color, fontSize: TAB_ICON_FONT_SIZE } }, [icon]);
  return icon;
}

function renderBadge(badge: string | number | undefined): IDescriptor | undefined {
  if (badge === undefined) return undefined;
  return el('symbiote-view', { style: BADGE_STYLE }, [
    txt({ style: BADGE_TEXT_STYLE }, [String(badge)]),
  ]);
}

export function renderTabBarItem(item: ITabBarItemView): IDescriptor {
  const color = resolveTintColor(item);
  const icon = renderIcon(item.icon, color);
  const badge = renderBadge(item.badge);

  const iconChildren: IDescriptor[] = [];
  if (icon) iconChildren.push(icon);
  if (badge) iconChildren.push(badge);

  const children: IDescriptor[] = [];
  if (iconChildren.length > 0)
    children.push(el('symbiote-view', { style: ICON_WRAPPER_STYLE }, iconChildren));
  children.push(txt({ style: { color, fontSize: TAB_LABEL_FONT_SIZE } }, [item.label]));

  return el(
    'symbiote-view',
    { ...item.passthrough, style: TAB_ITEM_STYLE, accessibilityRole: 'tab' },
    children,
    item.key,
  );
}

export function renderTabBar(view: ITabBarViewProps): IDescriptor {
  const items = view.items.map(renderTabBarItem);
  return el('symbiote-view', { ...view.passthrough, style: [TAB_BAR_STYLE, view.style] }, items);
}
