import { useState, useId } from 'react';
import * as Ariakit from '@ariakit/react';
import { DropdownPopup, TooltipAnchor } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { Ellipsis, PlusCircle, MessageCircleDashed } from 'lucide-react';
import { BookmarkFilledIcon, BookmarkIcon } from '@radix-ui/react-icons';
import type { TStartupConfig } from 'librechat-data-provider';
import type * as t from '~/common';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import useBookmarkItems from '~/hooks/Chat/useBookmarkItems';
import useTemporaryChat from '~/hooks/Chat/useTemporaryChat';
import useExportShare from '~/hooks/Chat/useExportShare';
import useMultiConvo from '~/hooks/Chat/useMultiConvo';
import { useHasAccess, useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * Mobile overflow menu. Collapses the header's secondary actions behind a
 * single control so the bar holds four targets instead of seven. Each action's
 * behaviour and visibility rule comes from the hook that also drives its
 * desktop button, so the two surfaces cannot drift apart.
 */
export default function HeaderMenu({
  startupConfig,
  className,
}: {
  startupConfig?: TStartupConfig;
  className?: string;
}) {
  const localize = useLocalize();
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });
  const hasAccessToMultiConvo = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });
  const hasAccessToTemporaryChat = useHasAccess({
    permissionType: PermissionTypes.TEMPORARY_CHAT,
    permission: Permissions.USE,
  });

  const multiConvo = useMultiConvo();
  const temporary = useTemporaryChat();
  const bookmarks = useBookmarkItems();
  const exportShare = useExportShare({
    isSharedButtonEnabled: startupConfig?.sharedLinksEnabled ?? false,
  });

  const showBookmarks = hasAccessToBookmarks === true && bookmarks.show;
  const showCompare = hasAccessToMultiConvo === true && multiConvo.show;
  const showTemporary = hasAccessToTemporaryChat === true && temporary.show;

  const items: t.MenuItemProps[] = [];

  if (showBookmarks) {
    items.push({
      id: 'header-bookmarks',
      label: localize('com_ui_bookmarks'),
      icon: bookmarks.hasBookmarks ? (
        <BookmarkFilledIcon className="icon-md mr-2 text-text-secondary" />
      ) : (
        <BookmarkIcon className="icon-md mr-2 text-text-secondary" />
      ),
      subItems: bookmarks.items,
    });
  }

  if (showCompare) {
    items.push({
      id: 'header-compare',
      label: localize('com_ui_add_multi_conversation'),
      icon: <PlusCircle className="icon-md mr-2 text-text-secondary" />,
      onClick: multiConvo.addConversation,
    });
  }

  if (exportShare.show) {
    const [first, ...rest] = exportShare.items;
    items.push({ ...first, separate: items.length > 0 }, ...rest);
  }

  if (showTemporary) {
    items.push({
      id: 'header-temporary',
      separate: items.length > 0,
      label: localize('com_ui_temporary'),
      ariaChecked: temporary.isTemporary,
      icon: <MessageCircleDashed className="icon-md mr-2 text-text-secondary" />,
      onClick: temporary.toggle,
    });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <BookmarkContext.Provider value={{ bookmarks: bookmarks.bookmarks }}>
      <DropdownPopup
        portal={true}
        menuId={menuId}
        focusLoop={true}
        unmountOnHide={true}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        items={items}
        trigger={
          <TooltipAnchor
            description={localize('com_ui_more_options')}
            render={
              <Ariakit.MenuButton
                id="header-menu-button"
                data-testid="header-overflow-menu"
                aria-label={localize('com_ui_more_options')}
                aria-expanded={isOpen}
                className={cn(
                  'inline-flex size-9 flex-shrink-0 items-center justify-center rounded-xl border border-border-light bg-presentation text-text-primary transition-colors hover:bg-surface-tertiary',
                  className,
                )}
              >
                <Ellipsis className="icon-md" aria-hidden="true" />
              </Ariakit.MenuButton>
            }
          />
        }
      />
      {showBookmarks && bookmarks.dialog}
      {exportShare.dialogs}
    </BookmarkContext.Provider>
  );
}
