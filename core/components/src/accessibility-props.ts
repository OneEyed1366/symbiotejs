// The accessibility prop surface shared by every user-facing component. symbiote
// forwards any non-function / non-style prop straight to Fabric (engine's
// fabricProps pass-through), so the canonical `accessibility*` props need no
// wiring beyond being declared here. The web-alias `aria-*` / `role` props are
// the exception: native reads only `accessibility*`, so they must be normalized
// in JS before commit; `resolveAccessibilityProps` does that, mirroring RN's
// own View.js transform. Types are kept in sync with RN's ViewAccessibility.js.
//
// Framework-agnostic (imports only @symbiote/engine), so every adapter (React,
// Vue, and the next) folds aria/role into accessibility* identically (ADR 0024).

import { dlog, type ISymbioteEvent } from '@symbiote/engine';

// Kept in sync with the AccessibilityRolesMask in RN's RCTViewManager.m
// (ViewAccessibility.js `AccessibilityRole`). The trailing `string & {}` keeps
// it open-ended exactly like RN (unknown/future roles still type-check) while
// preserving editor autocomplete for the named members.
export type IAccessibilityRole =
  | 'none'
  | 'button'
  | 'dropdownlist'
  | 'togglebutton'
  | 'link'
  | 'search'
  | 'image'
  | 'keyboardkey'
  | 'text'
  | 'adjustable'
  | 'imagebutton'
  | 'header'
  | 'summary'
  | 'alert'
  | 'checkbox'
  | 'combobox'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'scrollbar'
  | 'spinbutton'
  | 'switch'
  | 'tab'
  | 'tabbar'
  | 'tablist'
  | 'timer'
  | 'list'
  | 'toolbar'
  | 'grid'
  | 'pager'
  | 'scrollview'
  | 'horizontalscrollview'
  | 'viewgroup'
  | 'webview'
  | 'drawerlayout'
  | 'slidingdrawer'
  | 'iconmenu'
  | (string & {});

// The web-aligned role values accepted by the `role` alias (RN's `Role`).
export type IRole =
  | 'alert'
  | 'alertdialog'
  | 'application'
  | 'article'
  | 'banner'
  | 'button'
  | 'cell'
  | 'checkbox'
  | 'columnheader'
  | 'combobox'
  | 'complementary'
  | 'contentinfo'
  | 'definition'
  | 'dialog'
  | 'directory'
  | 'document'
  | 'feed'
  | 'figure'
  | 'form'
  | 'grid'
  | 'group'
  | 'heading'
  | 'img'
  | 'link'
  | 'list'
  | 'listitem'
  | 'log'
  | 'main'
  | 'marquee'
  | 'math'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'meter'
  | 'navigation'
  | 'none'
  | 'note'
  | 'option'
  | 'presentation'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowgroup'
  | 'rowheader'
  | 'scrollbar'
  | 'searchbox'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'status'
  | 'summary'
  | 'switch'
  | 'tab'
  | 'table'
  | 'tablist'
  | 'tabpanel'
  | 'term'
  | 'timer'
  | 'toolbar'
  | 'tooltip'
  | 'tree'
  | 'treegrid'
  | 'treeitem';

export interface IAccessibilityStateValue {
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean | 'mixed';
  busy?: boolean;
  expanded?: boolean;
}

export interface IAccessibilityValue {
  min?: number;
  max?: number;
  now?: number;
  text?: string;
}

export interface IAccessibilityActionInfo {
  name: string;
  label?: string;
}

export interface IAccessibilityProps {
  // --- host-node identity anchors ---
  // Not accessibility props per se, but RN puts them on ViewProps so EVERY host view
  // carries them; symbiote's one shared base is this interface, so they live here to
  // reach every component (both adapters) without each redeclaring them. Both forward
  // straight to Fabric via the non-function/non-style pass-through (no extra wiring).
  // testID: the e2e / native-side lookup anchor (Detox by.id). nativeID: a stable
  // native handle (focus anchor / cross-node lookup), distinct from testID.
  testID?: string;
  nativeID?: string;

  // --- cross-platform ---
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: IAccessibilityRole;
  accessibilityState?: IAccessibilityStateValue;
  accessibilityValue?: IAccessibilityValue;
  accessibilityActions?: ReadonlyArray<IAccessibilityActionInfo>;

  // --- Android-only (harmless on iOS: native ignores unknown props) ---
  accessibilityLabelledBy?: string | string[];
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  screenReaderFocusable?: boolean;

  // --- iOS-only (harmless on Android: native ignores unknown props) ---
  accessibilityViewIsModal?: boolean;
  accessibilityElementsHidden?: boolean;
  accessibilityIgnoresInvertColors?: boolean;
  accessibilityLanguage?: string;
  accessibilityRespondsToUserInteraction?: boolean;
  accessibilityShowsLargeContentViewer?: boolean;
  accessibilityLargeContentTitle?: string;

  // --- accessibility event handlers (wired by the shared-events layer) ---
  // cross-platform; nativeEvent.actionName names the triggered action
  onAccessibilityAction?: (event: ISymbioteEvent) => void;
  // iOS-only
  onAccessibilityTap?: (event: ISymbioteEvent) => void;
  // iOS-only
  onMagicTap?: (event: ISymbioteEvent) => void;
  // iOS-only
  onAccessibilityEscape?: (event: ISymbioteEvent) => void;
}

// Web-alias props. A component opts into these by including AriaProps; the
// `resolveAccessibilityProps` transform folds them into the canonical
// `accessibility*` props before they reach native (which never reads `aria-*`).
export interface IAriaProps {
  role?: IRole;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-live'?: 'polite' | 'assertive' | 'off';
  'aria-hidden'?: boolean;
  'aria-busy'?: boolean;
  'aria-checked'?: boolean | 'mixed';
  'aria-disabled'?: boolean;
  'aria-expanded'?: boolean;
  'aria-selected'?: boolean;
  'aria-modal'?: boolean;
  'aria-valuemax'?: number;
  'aria-valuemin'?: number;
  'aria-valuenow'?: number;
  'aria-valuetext'?: string;
}

// RN's web `role` → native `accessibilityRole`. Where the web role has no native
// counterpart it is forwarded unchanged (the AccessibilityRole union stays open),
// so the map only lists the values that actually differ.
const ROLE_TO_ACCESSIBILITY_ROLE: Readonly<Record<string, IAccessibilityRole>> = {
  alert: 'alert',
  button: 'button',
  checkbox: 'checkbox',
  combobox: 'combobox',
  grid: 'grid',
  heading: 'header',
  img: 'image',
  link: 'link',
  list: 'list',
  listitem: 'list',
  menu: 'menu',
  menubar: 'menubar',
  menuitem: 'menuitem',
  none: 'none',
  presentation: 'none',
  progressbar: 'progressbar',
  radio: 'radio',
  radiogroup: 'radiogroup',
  scrollbar: 'scrollbar',
  searchbox: 'search',
  slider: 'adjustable',
  spinbutton: 'spinbutton',
  summary: 'summary',
  switch: 'switch',
  tab: 'tab',
  tablist: 'tablist',
  timer: 'timer',
  toolbar: 'toolbar',
};

function accessibilityRoleFromRole(role: IRole): IAccessibilityRole {
  return ROLE_TO_ACCESSIBILITY_ROLE[role] ?? role;
}

const ARIA_KEYS: ReadonlyArray<keyof IAriaProps> = [
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-live',
  'aria-hidden',
  'aria-busy',
  'aria-checked',
  'aria-disabled',
  'aria-expanded',
  'aria-selected',
  'aria-modal',
  'aria-valuemax',
  'aria-valuemin',
  'aria-valuenow',
  'aria-valuetext',
];

function hasAnyAriaKey(props: IAriaProps): boolean {
  return ARIA_KEYS.some(key => props[key] !== undefined);
}

// Fold the web-alias `aria-*` / `role` props into the canonical `accessibility*`
// props, mirroring RN's View.js transform. Canonical props take precedence per
// View.js: each aria value fills in via `??` only where the canonical field is
// still empty. The alias keys are blanked to `undefined` in the result so they
// never reach native (the commit layer drops undefined props); the returned
// object keeps type `T`, spreadable straight into createElement. When no alias
// is present the input passes through untouched (cheap fast path).
export function resolveAccessibilityProps<T extends IAccessibilityProps & IAriaProps>(props: T): T {
  if (!hasAnyAriaKey(props)) return props;

  dlog('resolveAccessibilityProps: folding aria/role aliases into accessibility* props');

  const {
    role,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-live': ariaLive,
    'aria-hidden': ariaHidden,
    'aria-busy': ariaBusy,
    'aria-checked': ariaChecked,
    'aria-disabled': ariaDisabled,
    'aria-expanded': ariaExpanded,
    'aria-selected': ariaSelected,
    'aria-modal': ariaModal,
    'aria-valuemax': ariaValueMax,
    'aria-valuemin': ariaValueMin,
    'aria-valuenow': ariaValueNow,
    'aria-valuetext': ariaValueText,
  } = props;

  const next: T = {
    ...props,
    role: undefined,
    'aria-label': undefined,
    'aria-labelledby': undefined,
    'aria-live': undefined,
    'aria-hidden': undefined,
    'aria-busy': undefined,
    'aria-checked': undefined,
    'aria-disabled': undefined,
    'aria-expanded': undefined,
    'aria-selected': undefined,
    'aria-modal': undefined,
    'aria-valuemax': undefined,
    'aria-valuemin': undefined,
    'aria-valuenow': undefined,
    'aria-valuetext': undefined,
  };

  if (ariaLabelledBy !== undefined && next.accessibilityLabelledBy === undefined) {
    next.accessibilityLabelledBy = ariaLabelledBy.split(/\s*,\s*/g);
  }

  if (ariaLabel !== undefined && next.accessibilityLabel === undefined) {
    next.accessibilityLabel = ariaLabel;
  }

  if (ariaLive !== undefined && next.accessibilityLiveRegion === undefined) {
    next.accessibilityLiveRegion = ariaLive === 'off' ? 'none' : ariaLive;
  }

  if (ariaHidden !== undefined) {
    if (next.accessibilityElementsHidden === undefined) {
      next.accessibilityElementsHidden = ariaHidden;
    }
    if (ariaHidden === true && next.importantForAccessibility === undefined) {
      next.importantForAccessibility = 'no-hide-descendants';
    }
  }

  if (ariaModal !== undefined && next.accessibilityViewIsModal === undefined) {
    next.accessibilityViewIsModal = ariaModal;
  }

  if (role !== undefined && next.accessibilityRole === undefined) {
    next.accessibilityRole = accessibilityRoleFromRole(role);
  }

  const existingState = props.accessibilityState;
  if (
    existingState !== undefined ||
    ariaBusy !== undefined ||
    ariaChecked !== undefined ||
    ariaDisabled !== undefined ||
    ariaExpanded !== undefined ||
    ariaSelected !== undefined
  ) {
    next.accessibilityState = {
      busy: ariaBusy ?? existingState?.busy,
      checked: ariaChecked ?? existingState?.checked,
      disabled: ariaDisabled ?? existingState?.disabled,
      expanded: ariaExpanded ?? existingState?.expanded,
      selected: ariaSelected ?? existingState?.selected,
    };
  }

  const existingValue = props.accessibilityValue;
  if (
    existingValue !== undefined ||
    ariaValueMax !== undefined ||
    ariaValueMin !== undefined ||
    ariaValueNow !== undefined ||
    ariaValueText !== undefined
  ) {
    next.accessibilityValue = {
      max: ariaValueMax ?? existingValue?.max,
      min: ariaValueMin ?? existingValue?.min,
      now: ariaValueNow ?? existingValue?.now,
      text: ariaValueText ?? existingValue?.text,
    };
  }

  return next;
}
