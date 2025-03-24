import React from 'react';
import type { ModelSelectorProps } from '~/common';
import { ModelSelectorProvider, useModelSelectorContext } from './ModelSelectorContext';
import { renderModelSpecs, renderEndpoints, renderSearchResults } from './components';
import { CustomMenu as Menu } from './CustomMenu';
import DialogManager from './DialogManager';
import { getSelectedIcon } from './utils';
import { useLocalize } from '~/hooks';

function ModelSelectorContent() {
  const localize = useLocalize();

  const {
    // LibreChat
    modelSpecs,
    mappedEndpoints,
    endpointsConfig,
    // State
    searchValue,
    searchResults,
    selectedValues,

    // Functions
    setSearchValue,
    getDisplayValue,
    setSelectedValues,
    // Dialog
    keyDialogOpen,
    setKeyDialogOpen,
    keyDialogEndpoint,
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
        combobox={<input placeholder="Search models and endpoints..." />}
        trigger={trigger}
      >
        {searchResults ? (
          renderSearchResults(searchResults, localize, searchValue)
        ) : (
          <>
            {renderModelSpecs(modelSpecs, selectedValues.modelSpec || '')}
            {renderEndpoints(mappedEndpoints)}
          </>
        )}
      </Menu>
      <DialogManager
        keyDialogOpen={keyDialogOpen}
        setKeyDialogOpen={setKeyDialogOpen}
        endpointsConfig={endpointsConfig || {}}
        keyDialogEndpoint={keyDialogEndpoint || undefined}
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
