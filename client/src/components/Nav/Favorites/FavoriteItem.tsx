import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Menu from '@ariakit/react/menu';
import { Ellipsis, Trash } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import { useNewConvo, useFavorites, useLocalize } from '~/hooks';
import { renderAgentAvatar, cn } from '~/utils';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';
import type t from 'librechat-data-provider';
import type { FavoriteModel } from '~/store/favorites';

type FavoriteItemProps = {
  item: t.Agent | FavoriteModel;
  type: 'agent' | 'model';
};

export default function FavoriteItem({ item, type }: FavoriteItemProps) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { newConversation } = useNewConvo();
  const { removeFavoriteAgent, removeFavoriteModel } = useFavorites();
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-testid="favorite-options-button"]')) {
      return;
    }

    if (type === 'agent') {
      const agent = item as t.Agent;
      newConversation({
        template: {
          ...agent,
          agent_id: agent.id,
        },
        preset: {
          ...agent,
          agent_id: agent.id,
        },
      });
      navigate(`/c/new`);
    } else {
      const model = item as FavoriteModel;
      newConversation({
        template: {
          endpoint: model.endpoint,
          model: model.model,
        },
        preset: {
          endpoint: model.endpoint,
          model: model.model,
        },
      });
      navigate(`/c/new`);
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
  };

  const renderIcon = () => {
    if (type === 'agent') {
      return renderAgentAvatar(item as t.Agent, { size: 20, className: 'mr-2' });
    }
    const model = item as FavoriteModel;
    return (
      <div className="mr-2 h-5 w-5">
        <EndpointIcon
          conversation={{ endpoint: model.endpoint, model: model.model } as any}
          endpoint={model.endpoint}
          model={model.model}
          size={20}
        />
      </div>
    );
  };

  const getName = () => {
    if (type === 'agent') {
      return (item as t.Agent).name;
    }
    return (item as FavoriteModel).label || (item as FavoriteModel).model;
  };

  const menuId = React.useId();

  const dropdownItems = [
    {
      label: localize('com_ui_remove'),
      onClick: handleRemove,
      icon: <Trash className="h-4 w-4 text-text-primary" />,
    },
  ];

  return (
    <div
      className="group relative flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-surface-hover"
      onClick={handleClick}
      data-testid="favorite-item"
    >
      <div className="flex flex-1 items-center truncate pr-6">
        {renderIcon()}
        <span className="truncate">{getName()}</span>
      </div>
      
      <div
        className={cn(
          'absolute right-2 flex items-center',
          isPopoverActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownPopup
          portal={true}
          mountByState={true}
          isOpen={isPopoverActive}
          setIsOpen={setIsPopoverActive}
          trigger={
            <Menu.MenuButton
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-hover focus:bg-surface-hover',
                isPopoverActive ? 'bg-surface-hover' : '',
              )}
              aria-label={localize('com_ui_options')}
              data-testid="favorite-options-button"
            >
              <Ellipsis className="h-4 w-4 text-text-secondary hover:text-text-primary" />
            </Menu.MenuButton>
          }
          items={dropdownItems}
          menuId={menuId}
        />
      </div>
    </div>
  );
}
