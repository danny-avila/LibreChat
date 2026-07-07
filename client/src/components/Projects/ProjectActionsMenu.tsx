import { useId, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import type { TChatProject } from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import ProjectRenameDialog from './ProjectRenameDialog';
import ProjectDeleteDialog from './ProjectDeleteDialog';

export default function ProjectActionsMenu({
  project,
  className,
}: {
  project: TChatProject;
  className?: string;
}) {
  const localize = useLocalize();
  const menuId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const items: MenuItemProps[] = [
    {
      label: localize('com_ui_rename_project'),
      onClick: () => setShowRenameDialog(true),
      icon: <Pencil className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
    },
    {
      label: localize('com_ui_delete_project'),
      onClick: () => setShowDeleteDialog(true),
      icon: <Trash2 className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
    },
  ];

  return (
    <>
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
      <ProjectRenameDialog
        open={showRenameDialog}
        onOpenChange={setShowRenameDialog}
        project={project}
      />
      <ProjectDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        project={project}
      />
    </>
  );
}
