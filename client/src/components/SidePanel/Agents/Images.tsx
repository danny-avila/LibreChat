import { useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { DropdownPopup } from '@librechat/client';
import type { MenuItemProps } from '~/common/menus';
import { useLocalize } from '~/hooks';

export function NoImage() {
  return (
    <div className="border-token-border-medium flex h-full w-full items-center justify-center rounded-full border-2 border-dashed border-black">
      <svg
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        viewBox="0 0 24 24"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-4xl"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </div>
  );
}

export const AgentAvatarRender = ({ url }: { url?: string }) => {
  return (
    <div>
      <div className="relative h-20 w-20 overflow-hidden rounded-full">
        <img
          src={url}
          className="bg-token-surface-secondary dark:bg-token-surface-tertiary h-full w-full rounded-full object-cover"
          alt="GPT"
          width="80"
          height="80"
          key={url || 'default-key'}
        />
      </div>
    </div>
  );
};

export function AvatarMenu({
  trigger,
  handleFileChange,
  onReset,
  canReset,
}: {
  trigger: React.ReactNode;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  canReset: boolean;
}) {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const onItemClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  const uploadLabel = localize('com_ui_upload_image');

  const items: MenuItemProps[] = [
    {
      id: 'upload-avatar',
      label: uploadLabel,
      onClick: () => onItemClick(),
    },
    ...(canReset
      ? ([
          { separate: true } as unknown as MenuItemProps,
          {
            id: 'reset-avatar',
            label: localize('com_ui_reset_var', { 0: 'Avatar' }),
            onClick: () => {
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
              onReset();
            },
          } as MenuItemProps,
        ] as MenuItemProps[])
      : ([] as MenuItemProps[])),
  ];

  return (
    <>
      <DropdownPopup
        trigger={<Ariakit.MenuButton render={trigger as any} />}
        items={items}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        menuId="agent-avatar-menu"
        placement="bottom"
        gutter={8}
        portal
        mountByState
      />
      <input
        accept="image/png,.png,image/jpeg,.jpg,.jpeg,image/gif,.gif,image/webp,.webp"
        multiple={false}
        type="file"
        style={{ display: 'none' }}
        onChange={(event) => {
          handleFileChange(event);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          } else {
            event.currentTarget.value = '';
          }
        }}
        ref={fileInputRef}
        tabIndex={-1}
      />
    </>
  );
}
