import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { FC } from 'react';
import { cn, getConvoSwitchLogic, getEndpointField, getIconKey } from '~/utils';
import { useLocalize, useUserKey, useDefaultConvo } from '~/hooks';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { useGetEndpointsQuery } from '~/data-provider';
import { useChatContext } from '~/Providers';
import { icons } from './Icons';
import store from '~/store';

type MenuItemProps = {
  title: string;
  value: EModelEndpoint;
  selected: boolean;
  description?: string;
  userProvidesKey: boolean;
  // iconPath: string;
  // hoverContent?: string;
};

const MenuItem: FC<MenuItemProps> = ({
  title,
  value: endpoint,
  description,
  selected,
  userProvidesKey,
  ...rest
}) => {
  const modularChat = useRecoilValue(store.modularChat);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { conversation, newConversation } = useChatContext();
  const getDefaultConversation = useDefaultConvo();

  const { getExpiry } = useUserKey(endpoint);
  const localize = useLocalize();
  const expiryTime = getExpiry() ?? '';

  const onSelectEndpoint = (newEndpoint?: EModelEndpoint) => {
    if (!newEndpoint) {
      return;
    }

    if (!expiryTime) {
      setDialogOpen(true);
    }

    const {
      template,
      shouldSwitch,
      isNewModular,
      newEndpointType,
      isCurrentModular,
      isExistingConversation,
    } = getConvoSwitchLogic({
      newEndpoint,
      modularChat,
      conversation,
      endpointsConfig,
    });

    const isModular = isCurrentModular && isNewModular && shouldSwitch;
    if (isExistingConversation && isModular) {
      template.endpointType = newEndpointType;

      const currentConvo = getDefaultConversation({
        /* target endpointType is necessary to avoid endpoint mixing */
        conversation: { ...(conversation ?? {}), endpointType: template.endpointType },
        preset: template,
      });

      /* We don't reset the latest message, only when changing settings mid-converstion */
      newConversation({
        template: currentConvo,
        preset: currentConvo,
        keepLatestMessage: true,
        keepAddedConvos: true,
      });
      return;
    }
    newConversation({
      template: { ...(template as Partial<TConversation>) },
      keepAddedConvos: isModular,
    });
  };

  const endpointType = getEndpointField(endpointsConfig, endpoint, 'type');
  const iconKey = getIconKey({ endpoint, endpointsConfig, endpointType });
  const Icon = icons[iconKey];

  return (
    <>
      <div
        role="option"
        aria-selected={selected}
        className={cn(
          'group m-1.5 flex max-h-[40px] cursor-pointer gap-2 rounded px-5 py-2.5 pr-3! text-sm opacity-100! hover:bg-surface-hover',
          'radix-disabled:pointer-events-none radix-disabled:opacity-50',
        )}
        tabIndex={0}
        {...rest}
        onClick={() => onSelectEndpoint(endpoint)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSelectEndpoint(endpoint);
          }
        }}
      >
        <div className="flex grow items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              {Icon != null && (
                <Icon
                  size={18}
                  endpoint={endpoint}
                  context={'menu-item'}
                  className="icon-md shrink-0 dark:text-white"
                  iconURL={getEndpointField(endpointsConfig, endpoint, 'iconURL')}
                />
              )}
              <div>
                {title}
                <div className="text-token-text-tertiary">{description}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {userProvidesKey ? (
              <div className="text-token-text-primary" key={`set-key-${endpoint}`}>
                <button
                  tabIndex={0}
                  aria-label={`${localize('com_endpoint_config_key')} for ${title}`}
                  className={cn(
                    'invisible flex gap-x-1 group-focus-within:visible group-hover:visible',
                    selected ? 'visible' : '',
                    expiryTime ? 'text-token-text-primary w-full rounded-lg p-2' : '',
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDialogOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setDialogOpen(true);
                    }
                  }}
                >
                  <div
                    className={cn(
                      'invisible group-focus-within:visible group-hover:visible',
                      expiryTime ? 'text-xs' : '',
                    )}
                  >
                    {localize('com_endpoint_config_key')}
                  </div>
                  <Settings className={cn(expiryTime ? 'icon-sm' : 'icon-md stroke-1')} />
                </button>
              </div>
            ) : null}
            {selected && (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="icon-md block group-hover:hidden"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
                  fill="currentColor"
                />
              </svg>
            )}
            {(!userProvidesKey || expiryTime) && (
              <div className="text-token-text-primary hidden gap-x-1 group-hover:flex ">
                {!userProvidesKey && <div className="">{localize('com_ui_new_chat')}</div>}
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="icon-md"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M16.7929 2.79289C18.0118 1.57394 19.9882 1.57394 21.2071 2.79289C22.4261 4.01184 22.4261 5.98815 21.2071 7.20711L12.7071 15.7071C12.5196 15.8946 12.2652 16 12 16H9C8.44772 16 8 15.5523 8 15V12C8 11.7348 8.10536 11.4804 8.29289 11.2929L16.7929 2.79289ZM19.7929 4.20711C19.355 3.7692 18.645 3.7692 18.2071 4.2071L10 12.4142V14H11.5858L19.7929 5.79289C20.2308 5.35499 20.2308 4.64501 19.7929 4.20711ZM6 5C5.44772 5 5 5.44771 5 6V18C5 18.5523 5.44772 19 6 19H18C18.5523 19 19 18.5523 19 18V14C19 13.4477 19.4477 13 20 13C20.5523 13 21 13.4477 21 14V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V6C3 4.34314 4.34315 3 6 3H10C10.5523 3 11 3.44771 11 4C11 4.55228 10.5523 5 10 5H6Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
      {userProvidesKey && (
        <SetKeyDialog
          open={isDialogOpen}
          endpoint={endpoint}
          endpointType={endpointType}
          onOpenChange={setDialogOpen}
          userProvideURL={getEndpointField(endpointsConfig, endpoint, 'userProvideURL')}
        />
      )}
    </>
  );
};

export default MenuItem;
