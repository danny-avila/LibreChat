import { useId, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import type { TConversationTag } from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import { useConversationTagsQuery } from '~/data-provider';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import BookmarkEditDialog from './BookmarkEditDialog';
import BookmarkDeleteDialog from './BookmarkDeleteDialog';

export default function BookmarkActionsMenu({
  bookmark,
  className,
}: {
  bookmark: TConversationTag;
  className?: string;
}) {
  const localize = useLocalize();
  const menuId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { data } = useConversationTagsQuery();

  const items: MenuItemProps[] = [
    {
      label: localize('com_ui_bookmarks_edit'),
      onClick: () => setShowEditDialog(true),
      icon: <Pencil className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
    },
    {
      label: localize('com_ui_bookmarks_delete'),
      onClick: () => setShowDeleteDialog(true),
      icon: <Trash2 className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
    },
  ];

  return (
    <BookmarkContext.Provider value={{ bookmarks: data ?? [] }}>
      <DropdownPopup
        portal={true}
        menuId={menuId}
        focusLoop={true}
        className="z-[125]"
        unmountOnHide={true}
        isOpen={isMenuOpen}
        setIsOpen={setIsMenuOpen}
        trigger={
          <Ariakit.MenuButton
            aria-label={localize('com_ui_more_options')}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md text-text-secondary outline-none transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
              className,
            )}
          >
            <Ellipsis className="h-4 w-4" aria-hidden="true" />
          </Ariakit.MenuButton>
        }
        items={items}
      />
      <BookmarkEditDialog
        open={showEditDialog}
        setOpen={setShowEditDialog}
        context="BookmarkActionsMenu"
        bookmark={bookmark}
      />
      <BookmarkDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        bookmark={bookmark}
      />
    </BookmarkContext.Provider>
  );
}
