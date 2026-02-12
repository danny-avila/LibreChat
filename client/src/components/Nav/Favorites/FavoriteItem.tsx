import React, { useState } from 'react';
import * as Menu from '@ariakit/react/menu';
import { Ellipsis, PinOff } from 'lucide-react';
import { DropdownPopup } from '@librechat/client';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import type { FavoriteModel } from '~/store/favorites';
import type t from 'librechat-data-provider';
import SpecIcon from '~/components/Chat/Menus/Endpoints/components/SpecIcon';
import MinimalIcon from '~/components/Endpoints/MinimalIcon';
import { useFavorites, useLocalize } from '~/hooks';
import { renderAgentAvatar, cn } from '~/utils';

type Kwargs = {
  model?: string;
  agent_id?: string;
  assistant_id?: string;
  spec?: string | null;
};

type FavoriteItemBaseProps = {
  onRemoveFocus?: () => void;
};

type AgentFavoriteProps = FavoriteItemBaseProps & {
  type: 'agent';
  item: t.Agent;
  onSelectEndpoint?: (endpoint?: EModelEndpoint | string | null, kwargs?: Kwargs) => void;
};

type ModelFavoriteProps = FavoriteItemBaseProps & {
  type: 'model';
  item: FavoriteModel;
  onSelectEndpoint?: (endpoint?: EModelEndpoint | string | null, kwargs?: Kwargs) => void;
};

type SpecFavoriteProps = FavoriteItemBaseProps & {
  type: 'spec';
  item: TModelSpec;
  onSelectSpec?: (spec: TModelSpec) => void;
  endpointsConfig?: TEndpointsConfig;
};

type FavoriteItemProps = AgentFavoriteProps | ModelFavoriteProps | SpecFavoriteProps;

export default function FavoriteItem(props: FavoriteItemProps) {
  const { type, onRemoveFocus } = props;
  const localize = useLocalize();
  const { removeFavoriteAgent, removeFavoriteModel, removeFavoriteSpec } = useFavorites();
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const handleSelect = () => {
    if (props.type === 'agent') {
      props.onSelectEndpoint?.(EModelEndpoint.agents, { agent_id: props.item.id });
    } else if (props.type === 'spec') {
      props.onSelectSpec?.(props.item);
    } else {
      props.onSelectEndpoint?.(props.item.endpoint, { model: props.item.model });
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
    if (props.type === 'agent') {
      removeFavoriteAgent(props.item.id);
    } else if (props.type === 'spec') {
      removeFavoriteSpec(props.item.name);
    } else {
      removeFavoriteModel(props.item.model, props.item.endpoint);
    }
    setIsPopoverActive(false);
    requestAnimationFrame(() => {
      onRemoveFocus?.();
    });
  };

  const renderIcon = () => {
    if (props.type === 'agent') {
      return renderAgentAvatar(props.item, { size: 'icon', className: 'mr-2' });
    }
    if (props.type === 'spec') {
      return (
        <div className="mr-2 h-5 w-5">
          <SpecIcon currentSpec={props.item} endpointsConfig={props.endpointsConfig} />
        </div>
      );
    }
    return (
      <div className="mr-2 h-5 w-5">
        <MinimalIcon endpoint={props.item.endpoint} size={20} isCreatedByUser={false} />
      </div>
    );
  };

  const getName = (): string => {
    if (props.type === 'agent') {
      return props.item.name ?? '';
    }
    if (props.type === 'spec') {
      return props.item.label;
    }
    return props.item.model;
  };

  const name = getName();
  const getTypeLabel = () => {
    if (type === 'agent') {
      return localize('com_ui_agent');
    }
    if (type === 'spec') {
      return localize('com_ui_model_spec');
    }
    return localize('com_ui_model');
  };
  const typeLabel = getTypeLabel();
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
        'group relative flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-text-primary outline-none hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white',
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
