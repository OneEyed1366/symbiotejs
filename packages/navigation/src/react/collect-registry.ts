// Shared by stack.ts/tabs.ts/drawer.ts: each navigator registers its own Screen marker
// component's props into a name -> entry map via React.Children, differing only in the marker
// component (isMarkerElement) and the props shape (TProps). Stays in react/ rather than core/:
// Children/isValidElement are React-only APIs (see CLAUDE.md <adapter_src_follows_framework_idioms>).

import { Children, type ReactElement, type ReactNode } from 'react';

export function collectRegistry<TProps extends { name: string }>(
  children: ReactNode,
  isMarkerElement: (child: ReactNode) => child is ReactElement<TProps>,
): Map<string, Omit<TProps, 'name'>> {
  const registry = new Map<string, Omit<TProps, 'name'>>();
  Children.forEach(children, child => {
    if (!isMarkerElement(child)) return;
    const { name, ...entry } = child.props;
    registry.set(name, entry);
  });
  return registry;
}
