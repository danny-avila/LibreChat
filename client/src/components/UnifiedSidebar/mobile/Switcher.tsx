import { memo, useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import type { NavLink } from '~/common';
import type * as t from '~/common';
import { useActivePanel, resolveActivePanel } from '~/Providers';
import { useLocalize } from '~/hooks';

/**
 * Doubles as the drawer's title: it names the panel you are in and is also how
 * you leave it. Replaces the icon rail's ten unlabelled glyphs with labelled
 * rows, and costs no standing width.
 */
function Switcher({ links }: { links: NavLink[] }) {
  const localize = useLocalize();
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const { active, setActive } = useActivePanel();

  const activeId = resolveActivePanel(active, links);
  const activeLink = links.find((link) => link.id === activeId);

  const items = useMemo<t.MenuItemProps[]>(
    () =>
      links.map((link) => ({
        id: `nav-panel-${link.id}`,
        label: localize(link.title),
        ariaChecked: link.id === activeId,
        className: link.id === activeId ? 'bg-surface-active-alt' : undefined,
        icon: <link.icon className="size-5 text-text-primary" aria-hidden="true" />,
        onClick: () => setActive(link.id),
      })),
    [links, activeId, localize, setActive],
  );

  if (!activeLink) {
    return null;
  }

  return (
    <DropdownPopup
      /**
       * Rendered inside the drawer rather than portaled to `document.body`:
       * `usePopoverZIndex()` hands portaled menus 50 outside a dialog, which is
       * behind the opaque full-screen drawer, leaving every destination
       * unreachable. Nothing between here and the drawer root clips overflow.
       */
      portal={false}
      menuId={menuId}
      focusLoop={true}
      unmountOnHide={true}
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      items={items}
      className="min-w-[240px]"
      iconClassName="mr-2 size-5"
      trigger={
        <Ariakit.MenuButton
          data-testid="panel-switcher-button"
          aria-label={localize('com_nav_control_panel')}
          aria-expanded={isOpen}
          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-text-primary hover:bg-surface-hover"
        >
          <activeLink.icon className="size-5 flex-shrink-0" aria-hidden="true" />
          <span className="truncate text-sm font-medium">{localize(activeLink.title)}</span>
          <ChevronDown className="size-4 flex-shrink-0 text-text-secondary" aria-hidden="true" />
        </Ariakit.MenuButton>
      }
    />
  );
}

export default memo(Switcher);
