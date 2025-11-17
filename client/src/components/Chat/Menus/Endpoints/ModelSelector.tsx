import React, { useMemo } from 'react';
import type { ModelSelectorProps } from '~/common';
import { SystemRoles } from 'librechat-data-provider';
import { ModelSelectorProvider, useModelSelectorContext } from './ModelSelectorContext';
import { ModelSelectorChatProvider } from './ModelSelectorChatContext';
import {
  renderModelSpecs,
  renderEndpoints,
  renderSearchResults,
  renderCustomGroups,
} from './components';
import { getSelectedIcon, getDisplayValue } from './utils';
import { CustomMenu as Menu } from './CustomMenu';
import DialogManager from './DialogManager';
import { useLocalize, useAuthContext } from '~/hooks';

function ModelSelectorContent() {
  const localize = useLocalize();

  const {
    // LibreChat
    agentsMap,
    modelSpecs,
    mappedEndpoints,
    endpointsConfig,
    // State
    searchValue,
    searchResults,
    selectedValues,

    // Functions
    setSearchValue,
    setSelectedValues,
    // Dialog
    keyDialogOpen,
    onOpenChange,
    keyDialogEndpoint,
  } = useModelSelectorContext();

  const selectedIcon = useMemo(
    () =>
      getSelectedIcon({
        mappedEndpoints: mappedEndpoints ?? [],
        selectedValues,
        modelSpecs,
        endpointsConfig,
      }),
    [mappedEndpoints, selectedValues, modelSpecs, endpointsConfig],
  );
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  const selectedDisplayValue = useMemo(() => {
    const value = getDisplayValue({
      localize,
      agentsMap,
      modelSpecs,
      selectedValues,
      mappedEndpoints,
    });
    // For regular users, show "HyperAI" instead of model name
    if (!isAdmin && value !== localize('com_ui_select_model')) {
      return 'HyperAI';
    }
    return value;
  }, [localize, agentsMap, modelSpecs, selectedValues, mappedEndpoints, isAdmin]);

  const trigger = (
    <button
      className="my-1 flex h-10 w-full max-w-[70vw] items-center justify-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary"
      aria-label={localize('com_ui_select_model')}
    >
      {selectedIcon && React.isValidElement(selectedIcon) && (
        <div className="flex flex-shrink-0 items-center justify-center overflow-hidden">
          {selectedIcon}
        </div>
      )}
      <span className="flex-grow truncate text-left">{selectedDisplayValue}</span>
    </button>
  );

  return (
    <div className="relative flex w-full max-w-md flex-col items-center gap-2">
      <Menu
        values={selectedValues}
        onValuesChange={(values: Record<string, any>) => {
          setSelectedValues({
            endpoint: values.endpoint || '',
            model: values.model || '',
            modelSpec: values.modelSpec || '',
          });
        }}
        onSearch={(value) => setSearchValue(value)}
        combobox={<input placeholder={localize('com_endpoint_search_models')} />}
        trigger={trigger}
      >
        {searchResults ? (
          renderSearchResults(searchResults, localize, searchValue)
        ) : (
          <>
            {/* Render ungrouped modelSpecs (no group field) */}
            {renderModelSpecs(
              modelSpecs?.filter((spec) => !spec.group) || [],
              selectedValues.modelSpec || '',
            )}
            {/* Render endpoints (will include grouped specs matching endpoint names) */}
            {renderEndpoints(mappedEndpoints ?? [])}
            {/* Render custom groups (specs with group field not matching any endpoint) */}
            {renderCustomGroups(modelSpecs || [], mappedEndpoints ?? [])}
          </>
        )}
      </Menu>
      <DialogManager
        keyDialogOpen={keyDialogOpen}
        onOpenChange={onOpenChange}
        endpointsConfig={endpointsConfig || {}}
        keyDialogEndpoint={keyDialogEndpoint || undefined}
      />
    </div>
  );
}

export default function ModelSelector({ startupConfig }: ModelSelectorProps) {
  const { user } = useAuthContext();
  const isAdmin = user?.role === SystemRoles.ADMIN;

  // Hide model selector for regular users, show for admins
  if (!isAdmin) {
    return null;
  }

  return (
    <ModelSelectorChatProvider>
      <ModelSelectorProvider startupConfig={startupConfig}>
        <ModelSelectorContent />
      </ModelSelectorProvider>
    </ModelSelectorChatProvider>
  );
}
