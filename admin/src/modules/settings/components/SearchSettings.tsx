import { useState } from 'react';
import type { TSearchConfig } from 'librechat-data-provider';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Checkbox } from 'primereact/checkbox';
import { SettingsDescriptions as desc } from './SettingsDescriptions';

type TSearchSettingsProps = {
  searchConfig: TSearchConfig | undefined;
  onUpdateSearchSettings: (settings: TSearchConfig) => void;
};

function SearchSettings({ searchConfig, onUpdateSearchSettings }: TSearchSettingsProps) {
  const [searchEnabled, setIsSearchEnabled] = useState<boolean>(
    searchConfig?.searchEnabled || true,
  );
  const [meiliHost, setMeiliHost] = useState<string>(
    searchConfig?.meiliHost || 'http://0.0.0.0:7700',
  );
  const [meiliAddress, setMeiliAddress] = useState<string>(
    searchConfig?.meiliAddress || '0.0.0.0:7700',
  );
  const [meiliKey, setMeiliKey] = useState<string>(
    searchConfig?.meiliKey || 'DrhYf7zENyR6AlUCKmnz0eYASOQdl6zxH7s7MKFSfFCt',
  );
  const [disableMeiliAnalytics, setDisableMeiliAnalytics] = useState<boolean>(
    searchConfig?.disableAnalytics || true,
  );

  const updateSearchSettings = () => {
    onUpdateSearchSettings({
      searchEnabled,
      meiliHost,
      meiliAddress,
      meiliKey,
      disableAnalytics: disableMeiliAnalytics,
    });
  };

  return (
    <Card title="Search">
      <div className="flex flex-col gap-2">
        {/* Enable search checkbox */}
        <div className="align-items-center flex">
          <Checkbox
            className="pt-1"
            checked={searchEnabled}
            id="searchEnabled"
            tooltip={desc.Search.searchEnabled}
            tooltipOptions={{ position: 'top' }}
            onChange={(e) => setIsSearchEnabled(e.checked || false)}
          />
          <label className="ml-2" htmlFor="searchEnabled">
            Enable Search
          </label>
        </div>
        {/* Search settings */}
        {searchEnabled && (
          <>
            <div className="my-4 flex w-full gap-3">
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="meiliHost"
                    type="text"
                    tooltip={desc.Search.meiliHost}
                    tooltipOptions={{ position: 'right' }}
                    onChange={(e) => setMeiliHost(e.target.value)}
                  />
                  <label htmlFor="meiliHost">MeiliSearch Host</label>
                </span>
              </div>
              <div className="w-1/2">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="meiliAddress"
                    type="text"
                    value={meiliAddress}
                    tooltip={desc.Search.meiliAddress}
                    tooltipOptions={{ position: 'left' }}
                    onChange={(e) => setMeiliAddress(e.target.value)}
                  />
                  <label htmlFor="meiliAddress">MeiliSearch HTTP Address</label>
                </span>
              </div>
            </div>
            <div className="my-4 flex w-full gap-3">
              <div className="w-full">
                <span className="p-float-label">
                  <InputText
                    className="w-full"
                    id="meiliKey"
                    type="text"
                    value={meiliKey}
                    tooltip={desc.Search.meiliKey}
                    tooltipOptions={{ position: 'top' }}
                    onChange={(e) => setMeiliKey(e.target.value)}
                  />
                  <label htmlFor="meiliKey">MeiliSearch Key</label>
                </span>
              </div>
            </div>
            <div className="my-4 flex w-full gap-3">
              <div className="align-items-center flex">
                <Checkbox
                  className="pt-1"
                  checked={disableMeiliAnalytics}
                  id="searchEnabled"
                  tooltip={desc.Search.disableAnalytics}
                  tooltipOptions={{ position: 'top' }}
                  onChange={(e) => setDisableMeiliAnalytics(e.checked || false)}
                />
                <label className="ml-2" htmlFor="searchEnabled">
                  Disable MeiliSearch Analytics
                </label>
              </div>
            </div>
          </>
        )}
        <Button label="Save" className="mt-5 w-1/4" onClick={updateSearchSettings} />
      </div>
    </Card>
  );
}

export default SearchSettings;
