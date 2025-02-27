import { useState, useMemo } from 'react';
import { Settings } from 'lucide-react';
import type { FC } from 'react';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { useLocalize, useUserKey } from '~/hooks';
import { cn, getEndpointField } from '~/utils';
import SpecIcon from './SpecIcon';

type MenuItemProps = {
  title: string;
  spec: TModelSpec;
  selected: boolean;
  description?: string;
  userProvidesKey: boolean;
  endpointsConfig: TEndpointsConfig;
  onClick?: () => void;
  // iconPath: string;
  // hoverContent?: string;
};

const MenuItem: FC<MenuItemProps> = ({
  title,
  spec,
  selected,
  description,
  userProvidesKey,
  endpointsConfig,
  onClick,
  ...rest
}) => {
  const { endpoint } = spec.preset;
  const [isDialogOpen, setDialogOpen] = useState(false);
  const { getExpiry } = useUserKey(endpoint ?? '');
  const localize = useLocalize();
  const expiryTime = getExpiry() ?? '';

  const clickHandler = () => {
    if (expiryTime) {
      setDialogOpen(true);
    }
    if (onClick) {
      onClick();
    }
  };

  const endpointType = useMemo(
    () => spec.preset.endpointType ?? getEndpointField(endpointsConfig, endpoint, 'type'),
    [spec, endpointsConfig, endpoint],
  );

  const { showIconInMenu = true } = spec;

  return (
    <>
      <div
        id={selected ? 'selected-llm' : undefined}
        role="option"
        aria-selected={selected}
        className="group m-1.5 flex cursor-pointer gap-2 rounded px-1 py-2.5 pr-3! text-sm opacity-100! hover:bg-black/5 focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-white/5"
        tabIndex={0}
        {...rest}
        onClick={clickHandler}
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            clickHandler();
          }
        }}
      >
        <div className="flex grow items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              {showIconInMenu && <SpecIcon currentSpec={spec} endpointsConfig={endpointsConfig} />}
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
                    expiryTime
                      ? 'w-full rounded-lg p-2 hover:bg-gray-200 dark:hover:bg-gray-900'
                      : '',
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
                className="icon-md block"
                // className="icon-md block group-hover:hidden"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
      {userProvidesKey && (
        <SetKeyDialog
          open={isDialogOpen}
          onOpenChange={setDialogOpen}
          endpoint={endpoint ?? ''}
          endpointType={endpointType}
        />
      )}
    </>
  );
};

export default MenuItem;
