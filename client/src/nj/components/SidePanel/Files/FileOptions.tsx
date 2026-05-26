import { useId } from 'react';
import * as Ariakit from '@ariakit/react';
import { DropdownPopup, useToastContext } from '@librechat/client';
import { Ellipsis, Pen, Pin } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { TFile } from 'librechat-data-provider';
import { useUpdateFileMutation } from '~/nj/data-provider/file-mutations';
import { logger } from '~/utils';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

export default function FileOptions({
  file,
  isPopoverActive,
  setIsPopoverActive,
  onRename,
}: {
  file: TFile;
  isPopoverActive: boolean;
  setIsPopoverActive: (open: boolean) => void;
  onRename: () => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const menuId = useId();
  const updateMutation = useUpdateFileMutation({
    onError: (err) => {
      logger.error('Error pinning file', err);
      showToast({
        message: 'Failed to pin file',
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });

  const dropdownItems = [
    {
      label: file.pinned ? localize('com_ui_unpin') : localize('com_ui_pin'),
      onClick: () => updateMutation.mutate({ file_id: file.file_id, pinned: !file.pinned }),
      icon: <Pin className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
      ariaLabel: file.pinned ? `Unpin "${file.filename}"` : `Pin "${file.filename}"`,
    },
    {
      label: localize('com_ui_rename'),
      onClick: onRename,
      icon: <Pen className="icon-sm mr-2 text-text-primary" aria-hidden="true" />,
      ariaLabel: `Rename "${file.filename}"`,
    },
  ];

  return (
    <DropdownPopup
      portal={true}
      menuId={menuId}
      focusLoop={true}
      className="z-[125]"
      unmountOnHide={true}
      isOpen={isPopoverActive}
      setIsOpen={setIsPopoverActive}
      trigger={
        <Ariakit.MenuButton
          aria-label={`File menu options for "${file.filename}"`}
          aria-expanded={isPopoverActive}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          onClick={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
          onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
          }}
        >
          <Ellipsis className="icon-md text-text-secondary" aria-hidden={true} />
        </Ariakit.MenuButton>
      }
      items={dropdownItems}
    />
  );
}
