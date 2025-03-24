import { useMemo } from 'react';
import { SettingsIcon } from 'lucide-react';
import { Spinner } from '~/components';
import { EModelEndpoint } from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { CustomMenu as Menu, CustomMenuItem as MenuItem } from '../CustomMenu';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { renderEndpointModels } from './EndpointModelItem';
import { filterModels } from '../utils';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface EndpointItemProps {
  endpoint: Endpoint;
}

const SettingsButton = ({
  endpoint,
  className,
  handleOpenKeyDialog,
}: {
  endpoint: Endpoint;
  className?: string;
  handleOpenKeyDialog: (endpoint: EModelEndpoint, e: React.MouseEvent) => void;
}) => {
  const localize = useLocalize();
  const text = localize('com_endpoint_config_key');
  return (
    <button
      id={`endpoint-${endpoint.value}-settings`}
      onClick={(e) => {
        if (!endpoint.value) {
          return;
        }
        e.stopPropagation();
        handleOpenKeyDialog(endpoint.value as EModelEndpoint, e);
      }}
      className={cn(
        'flex items-center overflow-visible text-text-primary transition-all duration-300 ease-in-out',
        'rounded-md px-1 hover:bg-surface-secondary',
        className,
      )}
      aria-label={`${text} ${endpoint.label}`}
    >
      <div className="flex w-[28px] items-center gap-1 whitespace-nowrap transition-all duration-300 ease-in-out group-hover:w-auto">
        <SettingsIcon className="h-4 w-4 flex-shrink-0" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 ease-in-out group-hover:max-w-[100px] group-hover:opacity-100">
          {text}
        </span>
      </div>
    </button>
  );
};

export function EndpointItem({ endpoint }: EndpointItemProps) {
  const {
    agentsMap,
    assistantsMap,
    selectedValues,
    handleOpenKeyDialog,
    handleSelectEndpoint,
    endpointSearchValues,
    setEndpointSearchValue,
    endpointRequiresUserKey,
  } = useModelSelectorContext();
  const { model: selectedModel, endpoint: selectedEndpoint } = selectedValues;

  const searchValue = endpointSearchValues[endpoint.value] || '';
  const isUserProvided = useMemo(() => endpointRequiresUserKey(endpoint.value), [endpoint.value]);

  const renderIconLabel = () => (
    <div className="flex items-center gap-2">
      {endpoint.icon && (
        <div className="flex flex-shrink-0 items-center justify-center overflow-hidden">
          {endpoint.icon}
        </div>
      )}
      <span className={cn('truncate text-left', isUserProvided ? 'group-hover:w-24' : '')}>
        {endpoint.label}
      </span>
    </div>
  );

  if (endpoint.hasModels) {
    const filteredModels = searchValue
      ? filterModels(endpoint, endpoint.models || [], searchValue, agentsMap, assistantsMap)
      : null;
    return (
      <Menu
        id={`endpoint-${endpoint.value}-menu`}
        key={`endpoint-${endpoint.value}-item`}
        className="transition-opacity duration-200 ease-in-out"
        defaultOpen={endpoint.value === selectedEndpoint}
        searchValue={searchValue}
        onSearch={(value) => setEndpointSearchValue(endpoint.value, value)}
        combobox={<input placeholder={`Search ${endpoint.label} models...`} />}
        label={
          <div
            onClick={() => handleSelectEndpoint(endpoint)}
            className="group flex w-full flex-shrink cursor-pointer items-center justify-between rounded-xl px-1 py-1 text-sm"
          >
            {renderIconLabel()}
            {isUserProvided && (
              <SettingsButton endpoint={endpoint} handleOpenKeyDialog={handleOpenKeyDialog} />
            )}
          </div>
        }
      >
        {endpoint.value === EModelEndpoint.assistants && endpoint.models === undefined ? (
          <div className="flex items-center justify-center p-2">
            <Spinner />
          </div>
        ) : filteredModels ? (
          renderEndpointModels(endpoint, endpoint.models || [], selectedModel, filteredModels)
        ) : (
          endpoint.models && renderEndpointModels(endpoint, endpoint.models, selectedModel)
        )}
      </Menu>
    );
  } else {
    return (
      <MenuItem
        id={`endpoint-${endpoint.value}-menu`}
        key={`endpoint-${endpoint.value}-item`}
        onClick={() => handleSelectEndpoint(endpoint)}
        className="flex h-8 w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm"
      >
        <div className="group flex w-full min-w-0 items-center justify-between">
          {renderIconLabel()}
          <div className="flex items-center gap-2">
            {endpointRequiresUserKey(endpoint.value) && (
              <SettingsButton endpoint={endpoint} handleOpenKeyDialog={handleOpenKeyDialog} />
            )}
            {selectedEndpoint === endpoint.value && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="block"
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
      </MenuItem>
    );
  }
}

export function renderEndpoints(mappedEndpoints: Endpoint[]) {
  return mappedEndpoints.map((endpoint) => (
    <EndpointItem endpoint={endpoint} key={`endpoint-${endpoint.value}-item`} />
  ));
}
