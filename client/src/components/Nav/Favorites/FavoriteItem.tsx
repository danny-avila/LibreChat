import React from 'react';
import { PinOff } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { EModelEndpoint } from 'librechat-data-provider';
import type { Agent, TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import type { FavoriteModel } from '~/store/favorites';
import SpecIcon from '~/components/Chat/Menus/Endpoints/components/SpecIcon';
import MinimalIcon from '~/components/Endpoints/MinimalIcon';
import { useFavorites, useLocalize } from '~/hooks';
import { renderAgentAvatar } from '~/utils';

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
  item: Agent;
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
  const { onRemoveFocus } = props;
  const localize = useLocalize();
  const { removeFavoriteAgent, removeFavoriteModel, removeFavoriteSpec } = useFavorites();

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
    if ((e.target as HTMLElement).closest('[data-testid="favorite-unpin-button"]')) {
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

  let name: string;
  let typeLabel: string;
  if (props.type === 'agent') {
    name = props.item.name ?? '';
    typeLabel = localize('com_ui_agent');
  } else if (props.type === 'spec') {
    name = props.item.label;
    typeLabel = localize('com_ui_model_spec');
  } else {
    name = props.item.model;
    typeLabel = localize('com_ui_model');
  }
  const ariaLabel = `${name} (${typeLabel})`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className="group relative flex w-full cursor-pointer items-center justify-between rounded-lg p-2 text-sm text-text-primary outline-none hover:bg-surface-active-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-testid="favorite-item"
    >
      <div className="flex flex-1 items-center truncate pr-6">
        {renderIcon()}
        <span className="truncate">{name}</span>
      </div>

      <div
        className={
          // Interactive by default so it's tappable on touch; only
          // hidden-until-hover on hover-capable pointers. Otherwise the
          // whole row is hover-dependent and the first tap just reveals
          // this instead of selecting (the iOS double-tap).
          'absolute right-1 flex items-center group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 [@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <TooltipAnchor
          description={localize('com_ui_unpin')}
          side="top"
          render={
            <button
              type="button"
              aria-label={localize('com_ui_unpin')}
              data-testid="favorite-unpin-button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md p-0 text-text-secondary transition-colors duration-150 hover:border-border-medium hover:bg-surface-active hover:text-text-primary focus-visible:border-border-medium focus-visible:bg-surface-active focus-visible:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
              onClick={handleRemove}
              onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                }
              }}
            >
              <PinOff className="size-4" aria-hidden={true} />
            </button>
          }
        />
      </div>
    </div>
  );
}
