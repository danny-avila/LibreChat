import React from 'react';
import { EModelEndpoint, TModelSpec, TInterfaceConfig } from 'librechat-data-provider';
import { renderModelSpecs, renderEndpoints, renderSearchResults } from './components';
import { ModelSelectorProvider, useModelSelectorContext } from './ModelSelectorContext';
import { useLocalize, useEndpoints, useKeyDialog } from '~/hooks';
import { useGetEndpointsQuery } from '~/data-provider';
import { CustomMenu as Menu } from './CustomMenu';
import { ModelSelectorProps } from './types';
import DialogManager from './DialogManager';
import { getSelectedIcon } from './utils';

function ModelSelectorContent() {
  const localize = useLocalize();
  const { mappedEndpoints, endpointRequiresUserKey } = useEndpoints();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { keyDialogOpen, keyDialogEndpoint, setKeyDialogOpen, handleOpenKeyDialog } =
    useKeyDialog();

  const {
    // LibreChat
    modelSpecs,
    // State
    searchValue,
    searchResults,
    selectedValues,

    // Functions
    setSearchValue,
    getDisplayValue,
    setSelectedValues,
  } = useModelSelectorContext();

  const selectedIcon = getSelectedIcon(mappedEndpoints, selectedValues, []);
  const selectedDisplayValue = getDisplayValue();

  const trigger = (
    <button
      className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      aria-label="Select model"
    >
      {selectedIcon && React.isValidElement(selectedIcon) && (
        <div className="flex items-center justify-center overflow-hidden rounded-full">
          {selectedIcon}
        </div>
      )}
      <span className="flex-grow truncate text-left">{selectedDisplayValue}</span>
    </button>
  );

  const handleOpenKeyDialogWrapper = (endpoint: string) => {
    handleOpenKeyDialog(endpoint as EModelEndpoint, {} as React.MouseEvent);
  };

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2">
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
        combobox={<input placeholder="Search models and endpoints..." />}
        trigger={trigger}
      >
        {searchResults ? (
          renderSearchResults(searchResults, localize, searchValue)
        ) : (
          <>
            {renderModelSpecs(modelSpecs, selectedValues.modelSpec || '')}
            {renderEndpoints(mappedEndpoints, handleOpenKeyDialogWrapper, endpointRequiresUserKey)}
          </>
        )}
      </Menu>
      <DialogManager
        keyDialogOpen={keyDialogOpen}
        keyDialogEndpoint={keyDialogEndpoint || undefined}
        setKeyDialogOpen={setKeyDialogOpen}
        endpointsConfig={endpointsConfig || {}}
      />
    </div>
  );
}

export default function ModelSelector({ interfaceConfig, modelSpecs }: ModelSelectorProps) {
  return (
    <ModelSelectorProvider modelSpecs={modelSpecs} interfaceConfig={interfaceConfig}>
      <ModelSelectorContent />
    </ModelSelectorProvider>
  );
}
