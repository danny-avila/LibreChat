import { useRef, useState } from 'react';
import {
  Label,
  Button,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  InfoHoverCard,
  OGDialogTrigger,
  OGDialogContent,
} from '@librechat/client';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { ProviderKeyEntry } from './utils';
import useProviderKeys, { useMediaProviderKeyScope } from './useProviderKeys';
import { useGetEndpointsQuery } from '~/data-provider';
import { getProviderKeyEntries } from './utils';
import ProviderKeyRow from './ProviderKeyRow';
import { useLocalize } from '~/hooks';

function ProviderKeyRows({
  entries,
  endpointsConfig,
  loading = false,
  showEmpty = true,
}: {
  entries: ProviderKeyEntry[];
  endpointsConfig?: TEndpointsConfig;
  loading?: boolean;
  showEmpty?: boolean;
}) {
  const localize = useLocalize();
  return (
    <div className="divide-y divide-border-light">
      {entries.map((entry) => (
        <ProviderKeyRow
          key={entry.keyName}
          endpoint={entry.endpoint}
          endpointsConfig={endpointsConfig ?? {}}
          label={entry.label}
          keyConfiguration={entry.keyConfiguration}
          conflict={entry.conflict}
          disabled={loading}
        />
      ))}
      {showEmpty && !loading && entries.length === 0 && (
        <p className="py-4 text-sm text-text-secondary">
          {localize('com_ui_provider_api_keys_empty')}
        </p>
      )}
    </div>
  );
}

export default function ProviderKeys() {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const endpoints = useProviderKeys();
  const mediaHost = useMediaProviderKeyScope();

  const handleOpenAutoFocus = (event: Event) => {
    event.preventDefault();
    contentRef.current?.focus();
  };

  return (
    <div className="flex items-center justify-between">
      <Label id="provider-api-keys-label">
        {localize('com_ui_settings_label_provider_api_keys')}
      </Label>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <Button variant="outline" aria-labelledby="provider-api-keys-label">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
        <OGDialogContent
          ref={contentRef}
          tabIndex={-1}
          onOpenAutoFocus={handleOpenAutoFocus}
          className="w-11/12 max-w-2xl bg-surface-dialog text-text-primary shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary"
          aria-describedby={undefined}
        >
          <OGDialogHeader className="space-y-0 pr-8 text-left">
            <div className="flex items-center gap-1.5">
              <OGDialogTitle>{localize('com_ui_settings_label_provider_api_keys')}</OGDialogTitle>
              <InfoHoverCard text={localize('com_ui_provider_api_keys_description')} />
            </div>
          </OGDialogHeader>
          {open && (
            <ProviderKeyRows
              entries={getProviderKeyEntries({
                chatEndpoints: endpoints,
                endpointsConfig,
                mediaIntegrations: mediaHost?.integrations,
              })}
              endpointsConfig={endpointsConfig}
            />
          )}
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
