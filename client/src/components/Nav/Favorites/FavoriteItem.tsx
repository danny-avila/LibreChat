import React, { useState } from 'react';
import * as Menu from '@ariakit/react/menu';
import { Ellipsis, PinOff } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import { EModelEndpoint } from 'librechat-data-provider';
import type { FavoriteModel } from '~/store/favorites';
import type t from 'librechat-data-provider';
import MinimalIcon from '~/components/Endpoints/MinimalIcon';
import { useFavorites, useLocalize } from '~/hooks';
import { renderAgentAvatar, cn } from '~/utils';

type Kwargs = {
  model?: string;
  agent_id?: string;
  assistant_id?: string;
  spec?: string | null;
};

type FavoriteItemProps = {
  item: t.Agent | FavoriteModel;
  type: 'agent' | 'model';
  onSelectEndpoint?: (endpoint?: EModelEndpoint | string | null, kwargs?: Kwargs) => void;
  onRemoveFocus?: () => void;
};

export default function FavoriteItem({
  item,
  type,
  onSelectEndpoint,
  onRemoveFocus,
}: FavoriteItemProps) {
  const localize = useLocalize();
  const { removeFavoriteAgent, removeFavoriteModel } = useFavorites();
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const handleSelect = () => {
    if (type === 'agent') {
      const agent = item as t.Agent;
      onSelectEndpoint?.(EModelEndpoint.agents, { agent_id: agent.id });
    } else {
      const model = item as FavoriteModel;
      onSelectEndpoint?.(model.endpoint, { model: model.model });
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-testid="favorite-options-button"]')) {
      return;
    }
    handleSelect();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect();
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (type === 'agent') {
      removeFavoriteAgent((item as t.Agent).id);
    } else {
      const model = item as FavoriteModel;
      removeFavoriteModel(model.model, model.endpoint);
    }
    setIsPopoverActive(false);
    requestAnimationFrame(() => {
      onRemoveFocus?.();
    });
  };

  const renderIcon = () => {
    if (type === 'agent') {
      return renderAgentAvatar(item as t.Agent, { size: 'icon', className: 'mr-2' });
    }
    const model = item as FavoriteModel;
    return (
      <div className="mr-2 h-5 w-5">
        <MinimalIcon endpoint={model.endpoint} size={20} isCreatedByUser={false} />
      </div>
    );
  };

  const getName = (): string => {
    if (type === 'agent') {
      return (item as t.Agent).name ?? '';
    }
    return (item as FavoriteModel).model;
  };

  const name = getName();
  const typeLabel = type === 'agent' ? localize('com_ui_agent') : localize('com_ui_model');
  const ariaLabel = `${name} (${typeLabel})`;

  const menuId = React.useId();

  const dropdownItems = [
    {
      label: localize('com_ui_unpin'),
      onClick: handleRemove,
      icon: <PinOff className="h-4 w-4 text-text-secondary" />,
    },
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={cn(
        'group relative flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-surface-active-alt',
        isPopoverActive ? 'bg-surface-active-alt' : '',
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-testid="favorite-item"
    >
      <div className="flex flex-1 items-center truncate pr-6">
        {renderIcon()}
        <span className="truncate">{name}</span>
      </div>

      <div
        className={cn(
          'absolute right-2 flex items-center',
          isPopoverActive
            ? 'opacity-100'
            : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownPopup
          portal={true}
          mountByState={true}
          isOpen={isPopoverActive}
          setIsOpen={setIsPopoverActive}
          className="z-[125]"
          trigger={
            <Menu.MenuButton
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md border-none p-0 text-sm font-medium ring-ring-primary transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50',
                isPopoverActive
                  ? 'opacity-100'
                  : 'opacity-0 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[open]:opacity-100',
              )}
              aria-label={localize('com_nav_convo_menu_options')}
              data-testid="favorite-options-button"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                }
              }}
            >
              <Ellipsis className="icon-md text-text-secondary" aria-hidden={true} />
            </Menu.MenuButton>
          }
          items={dropdownItems}
          menuId={menuId}
        />
      </div>
    </div>
  );
}
