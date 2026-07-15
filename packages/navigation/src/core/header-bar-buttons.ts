// Header bar-button payload + dispatch: the native-shaped `headerLeftBarButtonItems`/
// `headerRightBarButtonItems` fold react-native-screens' own ScreenStackHeaderConfig component
// would send down, plus the buttonId/menuId -> onPress lookup that answers RNSScreenStackHeader-
// Config's `onPressHeaderBarButtonItem`/`onPressHeaderBarButtonMenuItem` events. Self-contained:
// only `resolveHeaderConfigView` (screen-options.ts) calls into this file, as a black box - the
// id-tagging scheme below is this cluster's own internal invariant, never a cross-file contract.

import { imageStatics } from '@symbiote-native/components';
import { processColor } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import type {
  IHeaderBarButtonIcon,
  IHeaderBarButtonItem,
  IHeaderBarButtonItemAction,
  IHeaderBarButtonItemMenu,
  IHeaderBarButtonMenuAction,
  IHeaderBarButtonSubmenu,
} from './navigator-props';

// RNS flattens `icon` into sfSymbolName/xcassetName/imageSource/templateSource at native-payload
// time (both the structured `icon` field AND the flat native keys reach native - RNS's own
// prepareHeaderBarButtonItems keeps both), and resolves image assets through the same resolver
// the Image component uses.
function prepareIcon(icon: IHeaderBarButtonIcon | undefined): Record<string, unknown> {
  if (!icon) return {};
  switch (icon.type) {
    case 'sfSymbol':
      return { sfSymbolName: icon.name };
    case 'xcasset':
      return { xcassetName: icon.name };
    case 'imageSource':
      return { imageSource: imageStatics.resolveAssetSource(icon.imageSource) };
    case 'templateSource':
      return { templateSource: imageStatics.resolveAssetSource(icon.templateSource) };
  }
}

type ISharedItem = IHeaderBarButtonItemAction | IHeaderBarButtonItemMenu;

// The one id algorithm both the payload tagger (prepareMenuItems/prepareHeaderBarButtonItems)
// and the dispatch-lookup builder (collectMenuHandlers/collectBarButtonHandlers) call - so a
// change to the id scheme genuinely can't desync payload tagging from dispatch lookup.
function buildMenuId(path: string, index: number, side: 'left' | 'right'): string {
  return `${path}-${index}-${side}`;
}

function buildButtonId(index: number, side: 'left' | 'right'): string {
  return `${index}-${side}`;
}

function prepareTitleStyle(
  titleStyle: ISharedItem['titleStyle'],
): Record<string, unknown> | undefined {
  if (!titleStyle) return undefined;
  return {
    ...titleStyle,
    color: titleStyle.color === undefined ? undefined : processColor(titleStyle.color),
  };
}

function prepareBadge(badge: ISharedItem['badge']): Record<string, unknown> | undefined {
  if (!badge) return undefined;
  return {
    ...badge,
    style: badge.style
      ? {
          ...badge.style,
          color: badge.style.color === undefined ? undefined : processColor(badge.style.color),
          backgroundColor:
            badge.style.backgroundColor === undefined
              ? undefined
              : processColor(badge.style.backgroundColor),
        }
      : undefined,
  };
}

// onPress is captured separately into the buttonId/menuId -> handler map (collectMenuHandlers/
// collectBarButtonHandlers below) and must never reach native: a function value fails Fabric's
// dynamic-value serialization, which silently drops the WHOLE headerLeftBarButtonItems/
// headerRightBarButtonItems array it's nested in - not just the one bad field - so bar buttons and
// menu actions never reached native at all, despite the buttonId/menuId dispatch wiring itself
// being entirely correct.
function excludeOnPress<T extends { onPress: unknown }>(item: T): Omit<T, 'onPress'> {
  const { onPress: _onPress, ...rest } = item;
  return rest;
}

// Shared fields common to the 'button' and 'menu' item variants (title/icon/tint/badge/...) - the
// 'spacing' variant carries none of these and passes through untouched.
function prepareSharedFields(
  item: IHeaderBarButtonItem & { type: 'button' | 'menu' },
): Record<string, unknown> {
  return {
    ...(item.type === 'button' ? excludeOnPress(item) : item),
    ...prepareIcon(item.icon),
    titleStyle: prepareTitleStyle(item.titleStyle),
    tintColor: item.tintColor === undefined ? undefined : processColor(item.tintColor),
    badge: prepareBadge(item.badge),
  };
}

type IMenuLike = { items: (IHeaderBarButtonMenuAction | IHeaderBarButtonSubmenu)[] };

// Recursively tags every menu action with a `menuId` derived from its tree position
// (`${path}-${index}-${side}`), mirroring RNS's own prepareMenu exactly - the id must match what
// buildHeaderBarButtonDispatch computes below, or a press silently no-ops.
function prepareMenuItems<T extends IMenuLike>(
  menuLike: T,
  index: number,
  side: 'left' | 'right',
  path = '',
): T {
  return {
    ...menuLike,
    items: menuLike.items.map((menuItem, menuIndex) => {
      const currentPath = path ? `${path}.${menuIndex}` : `${menuIndex}`;
      const icon = prepareIcon(menuItem.icon);
      if (menuItem.type === 'submenu') {
        return { ...menuItem, ...icon, ...prepareMenuItems(menuItem, index, side, currentPath) };
      }
      return {
        ...excludeOnPress(menuItem),
        ...icon,
        menuId: buildMenuId(currentPath, index, side),
      };
    }),
  };
}

// Builds the native-shaped payload react-native-screens' own ScreenStackHeaderConfig component
// would send down (buttonId/menuId-tagged, colors processColor'd) - this is what
// IHeaderConfigViewProps.headerLeftBarButtonItems/headerRightBarButtonItems actually carry.
export function prepareHeaderBarButtonItems(
  items: IHeaderBarButtonItem[] | undefined,
  side: 'left' | 'right',
): unknown[] | undefined {
  if (!items) return undefined;
  return items.map((item, index) => {
    if (item.type === 'spacing') return item;
    const prepared = prepareSharedFields(item);
    if (item.type === 'button') return { ...prepared, buttonId: buildButtonId(index, side) };
    return { ...prepared, menu: prepareMenuItems(item.menu, index, side) };
  });
}

function collectMenuHandlers(
  items: (IHeaderBarButtonMenuAction | IHeaderBarButtonSubmenu)[],
  index: number,
  side: 'left' | 'right',
  path: string,
  handlers: Map<string, () => void>,
): void {
  items.forEach((item, menuIndex) => {
    const currentPath = path ? `${path}.${menuIndex}` : `${menuIndex}`;
    if (item.type === 'submenu') {
      collectMenuHandlers(item.items, index, side, currentPath, handlers);
      return;
    }
    handlers.set(buildMenuId(currentPath, index, side), item.onPress);
  });
}

function collectBarButtonHandlers(
  items: IHeaderBarButtonItem[] | undefined,
  side: 'left' | 'right',
  buttonHandlers: Map<string, () => void>,
  menuHandlers: Map<string, () => void>,
): void {
  items?.forEach((item, index) => {
    if (item.type === 'button') {
      buttonHandlers.set(buildButtonId(index, side), item.onPress);
    } else if (item.type === 'menu') {
      collectMenuHandlers(item.menu.items, index, side, '', menuHandlers);
    }
  });
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

type IHeaderBarButtonDispatch = {
  onPressHeaderBarButtonItem?: (event: ISymbioteEvent) => void;
  onPressHeaderBarButtonMenuItem?: (event: ISymbioteEvent) => void;
};

// The buttonId/menuId → onPress lookup is built independently from prepareHeaderBarButtonItems'
// native payload (rather than re-parsing it back out of the `unknown[]` result), over the
// ORIGINAL typed items - but both sides call the same buildMenuId/buildButtonId, so the id
// scheme lives in one place and can't desync payload tagging from dispatch lookup.
export function buildHeaderBarButtonDispatch(
  leftItems: IHeaderBarButtonItem[] | undefined,
  rightItems: IHeaderBarButtonItem[] | undefined,
): IHeaderBarButtonDispatch {
  const buttonHandlers = new Map<string, () => void>();
  const menuHandlers = new Map<string, () => void>();
  collectBarButtonHandlers(leftItems, 'left', buttonHandlers, menuHandlers);
  collectBarButtonHandlers(rightItems, 'right', buttonHandlers, menuHandlers);
  if (buttonHandlers.size === 0 && menuHandlers.size === 0) return {};
  return {
    onPressHeaderBarButtonItem: event => {
      const buttonId = readStringField(event.nativeEvent, 'buttonId');
      if (buttonId !== undefined) buttonHandlers.get(buttonId)?.();
    },
    onPressHeaderBarButtonMenuItem: event => {
      const menuId = readStringField(event.nativeEvent, 'menuId');
      if (menuId !== undefined) menuHandlers.get(menuId)?.();
    },
  };
}
