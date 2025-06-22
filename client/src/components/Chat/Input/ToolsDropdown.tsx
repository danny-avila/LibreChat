import React, { useState, useMemo } from 'react';
import * as Ariakit from '@ariakit/react';
import { Settings2, Search, ImageIcon, Globe, PenTool } from 'lucide-react';
import { TooltipAnchor, DropdownPopup } from '~/components';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ToolsDropdownProps {
  conversationId?: string | null;
  disabled?: boolean;
}

const ToolsDropdown = ({ disabled, conversationId }: ToolsDropdownProps) => {
  const localize = useLocalize();
  const isDisabled = disabled ?? false;
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const dropdownItems = useMemo(() => {
    return [
      {
        render: () => (
          <div className="px-3 py-2 text-xs font-semibold text-text-secondary">
            {localize('com_ui_tools')}
          </div>
        ),
        hideOnClick: false,
      },
      {
        label: 'Search connectors',
        onClick: () => {
          // TODO: Implement search connectors functionality
          console.log('Search connectors clicked');
        },
        icon: <Search className="icon-md" />,
        badge: 'NEW',
      },
      {
        label: 'Create an image',
        onClick: () => {
          // TODO: Implement create image functionality
          console.log('Create an image clicked');
        },
        icon: <ImageIcon className="icon-md" />,
      },
      {
        label: 'Search the web',
        onClick: () => {
          // TODO: Implement web search functionality
          console.log('Search the web clicked');
        },
        icon: <Globe className="icon-md" />,
      },
      {
        label: 'Write or code',
        onClick: () => {
          // TODO: Implement write or code functionality
          console.log('Write or code clicked');
        },
        icon: <PenTool className="icon-md" />,
      },
    ];
  }, []);

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          disabled={isDisabled}
          id="tools-dropdown-button"
          aria-label="Tools Options"
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
          )}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <Settings2 className="icon-md" />
          </div>
        </Ariakit.MenuButton>
      }
      id="tools-dropdown-button"
      description={localize('com_ui_tools')}
      disabled={isDisabled}
    />
  );

  return (
    <DropdownPopup
      menuId="tools-dropdown-menu"
      isOpen={isPopoverActive}
      setIsOpen={setIsPopoverActive}
      modal={true}
      unmountOnHide={true}
      trigger={menuTrigger}
      items={dropdownItems}
      iconClassName="mr-0"
    />
  );
};

export default React.memo(ToolsDropdown);
