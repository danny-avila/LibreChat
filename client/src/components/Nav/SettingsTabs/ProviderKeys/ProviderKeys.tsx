import { useState } from 'react';
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
import { useGetEndpointsQuery } from '~/data-provider';
import useProviderKeys from './useProviderKeys';
import ProviderKeyRow from './ProviderKeyRow';
import { useLocalize } from '~/hooks';

export default function ProviderKeys() {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const endpoints = useProviderKeys();

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
          className="w-11/12 max-w-2xl bg-background text-text-primary shadow-2xl"
          aria-describedby={undefined}
        >
          <OGDialogHeader className="space-y-0 pr-8 text-left">
            <div className="flex items-center gap-1.5">
              <OGDialogTitle>{localize('com_ui_settings_label_provider_api_keys')}</OGDialogTitle>
              <InfoHoverCard text={localize('com_ui_provider_api_keys_description')} />
            </div>
          </OGDialogHeader>
          {endpointsConfig && (
            <div className="divide-y divide-border-light">
              {endpoints.map((endpoint) => (
                <ProviderKeyRow
                  key={endpoint}
                  endpoint={endpoint}
                  endpointsConfig={endpointsConfig}
                />
              ))}
            </div>
          )}
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
