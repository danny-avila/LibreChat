import { useMemo } from 'react';
import { Spinner, TooltipAnchor } from '@librechat/client';
import { CheckCircle2, MousePointerClick, SettingsIcon } from 'lucide-react';
import { EModelEndpoint, isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { CustomMenu as Menu, CustomMenuItem as MenuItem } from '../CustomMenu';
import { useModelSelectorContext } from '../ModelSelectorContext';
import { renderEndpointModels } from './EndpointModelItem';
import { ModelSpecItem } from './ModelSpecItem';
import { filterModels } from '../utils';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface EndpointItemProps {
  endpoint: Endpoint;
  endpointIndex: number;
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

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!endpoint.value) {
      return;
    }
    e.stopPropagation();
    handleOpenKeyDialog(endpoint.value as EModelEndpoint, e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (endpoint.value) {
        handleOpenKeyDialog(endpoint.value as EModelEndpoint, e as unknown as React.MouseEvent);
      }
    }
  };

  return (
    <button
      type="button"
      id={`endpoint-${endpoint.value}-settings`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group/button flex items-center gap-1.5 rounded-md px-1.5',
        'text-text-secondary transition-colors duration-150',
        'hover:bg-surface-tertiary hover:text-text-primary',
        'focus-visible:bg-surface-tertiary focus-visible:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        className,
      )}
      aria-label={`${text} ${endpoint.label}`}
    >
      <SettingsIcon className="size-4 shrink-0" aria-hidden="true" />
      <span
        aria-hidden="true"
        className={cn(
          'grid overflow-hidden transition-[grid-template-columns,opacity] duration-150 ease-out',
          'grid-cols-[0fr] opacity-0',
          'group-hover/button:grid-cols-[1fr] group-hover/button:opacity-100',
          'group-focus-visible/button:grid-cols-[1fr] group-focus-visible/button:opacity-100',
        )}
      >
        <span className="min-w-0 truncate pr-0.5">{text}</span>
      </span>
    </button>
  );
};

export function EndpointItem({ endpoint, endpointIndex }: EndpointItemProps) {
  const localize = useLocalize();
  const {
    agentsMap,
    assistantsMap,
    modelSpecs,
    selectedValues,
    handleOpenKeyDialog,
    handleSelectEndpoint,
    endpointSearchValues,
    setEndpointSearchValue,
    endpointRequiresUserKey,
  } = useModelSelectorContext();
  const {
    model: selectedModel,
    endpoint: selectedEndpoint,
    modelSpec: selectedSpec,
  } = selectedValues;

  // Filter modelSpecs for this endpoint (by group matching endpoint value)
  const endpointSpecs = useMemo(() => {
    if (!modelSpecs || !modelSpecs.length) {
      return [];
    }
    return modelSpecs.filter((spec: TModelSpec) => spec.group === endpoint.value);
  }, [modelSpecs, endpoint.value]);

  const searchValue = endpointSearchValues[endpoint.value] || '';
  const isUserProvided = useMemo(
    () => endpointRequiresUserKey(endpoint.value),
    [endpointRequiresUserKey, endpoint.value],
  );

  const isAssistantsNotLoaded =
    isAssistantsEndpoint(endpoint.value) && endpoint.models === undefined;

  const renderIconLabel = () => (
    <div className="flex min-w-0 items-center gap-2">
      {endpoint.icon && (
        <div className="flex shrink-0 items-center justify-center" aria-hidden="true">
          {endpoint.icon}
        </div>
      )}
      <span className="truncate text-left">{endpoint.label}</span>
    </div>
  );

  if (endpoint.hasModels) {
    const filteredModels = searchValue
      ? filterModels(
          endpoint,
          (endpoint.models || []).map((model) => model.name),
          searchValue,
          agentsMap,
          assistantsMap,
        )
      : null;
    const placeholder =
      isAgentsEndpoint(endpoint.value) || isAssistantsEndpoint(endpoint.value)
        ? localize('com_endpoint_search_var', { 0: endpoint.label })
        : localize('com_endpoint_search_endpoint_models', { 0: endpoint.label });
    return (
      <Menu
        id={`endpoint-${endpoint.value}-menu`}
        key={`endpoint-${endpoint.value}-item`}
        defaultOpen={endpoint.value === selectedEndpoint}
        searchValue={searchValue}
        onSearch={(value) => setEndpointSearchValue(endpoint.value, value)}
        combobox={<input placeholder=" " />}
        comboboxLabel={placeholder}
        onClick={() => handleSelectEndpoint(endpoint)}
        label={
          <div className="group flex w-full min-w-0 items-center justify-between gap-1.5 py-1 text-sm">
            {renderIconLabel()}
            {isUserProvided && (
              <SettingsButton endpoint={endpoint} handleOpenKeyDialog={handleOpenKeyDialog} />
            )}
          </div>
        }
      >
        {isAssistantsEndpoint(endpoint.value) && endpoint.models === undefined ? (
          <div
            className="flex items-center justify-center p-2"
            role="status"
            aria-label={localize('com_ui_loading')}
          >
            <Spinner aria-hidden="true" />
          </div>
        ) : (
          <>
            {/* Render modelSpecs for this endpoint */}
            {endpointSpecs.map((spec: TModelSpec) => (
              <ModelSpecItem key={spec.name} spec={spec} isSelected={selectedSpec === spec.name} />
            ))}
            {/* Render endpoint models */}
            {filteredModels
              ? renderEndpointModels(
                  endpoint,
                  endpoint.models || [],
                  selectedModel,
                  filteredModels,
                  endpointIndex,
                )
              : endpoint.models &&
                renderEndpointModels(
                  endpoint,
                  endpoint.models,
                  selectedModel,
                  undefined,
                  endpointIndex,
                )}
          </>
        )}
      </Menu>
    );
  } else {
    return (
      <MenuItem
        id={`endpoint-${endpoint.value}-menu`}
        key={`endpoint-${endpoint.value}-item`}
        onClick={() => handleSelectEndpoint(endpoint)}
        className="group flex w-full cursor-pointer items-center justify-between gap-1.5 py-2 text-sm"
      >
        {renderIconLabel()}
        <div className="flex shrink-0 items-center gap-2">
          {endpointRequiresUserKey(endpoint.value) && (
            <SettingsButton endpoint={endpoint} handleOpenKeyDialog={handleOpenKeyDialog} />
          )}
          {isAssistantsNotLoaded && (
            <TooltipAnchor
              description={localize('com_ui_click_to_view_var', { 0: endpoint.label })}
              side="top"
              render={
                <span className="flex items-center">
                  <MousePointerClick className="size-4 text-text-secondary" aria-hidden="true" />
                </span>
              }
            />
          )}
          {selectedEndpoint === endpoint.value && !isAssistantsNotLoaded && (
            <CheckCircle2 className="size-4 shrink-0 text-text-primary" aria-hidden="true" />
          )}
        </div>
      </MenuItem>
    );
  }
}

export function renderEndpoints(mappedEndpoints: Endpoint[]) {
  return mappedEndpoints.map((endpoint, index) => (
    <EndpointItem
      endpoint={endpoint}
      endpointIndex={index}
      key={`endpoint-${endpoint.value}-${index}`}
    />
  ));
}
