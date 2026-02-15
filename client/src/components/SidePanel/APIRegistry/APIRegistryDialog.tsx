import React, { useState, useEffect } from 'react';
import {
  OGDialog,
  OGDialogTemplate,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Button,
  Input,
  Label,
  Spinner,
} from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useParseOpenAPISpec, useCreateAPIRegistry } from '~/data-provider';
import EndpointSelectionDialog from './EndpointSelectionDialog';

interface APIRegistryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api?: any | null;
}

export default function APIRegistryDialog({
  open,
  onOpenChange,
  api,
}: APIRegistryDialogProps) {
  const localize = useLocalize();
  const [swaggerUrl, setSwaggerUrl] = useState('');
  const [parsedSpec, setParsedSpec] = useState<any>(null);
  const [showEndpointSelection, setShowEndpointSelection] = useState(false);

  const parseSpec = useParseOpenAPISpec();
  const createAPI = useCreateAPIRegistry();

  useEffect(() => {
    if (open && api) {
      setSwaggerUrl(api.config?.apiConfig?.swaggerUrl || '');
    } else if (!open) {
      setSwaggerUrl('');
      setParsedSpec(null);
    }
  }, [open, api]);

  const handleParse = async () => {
    if (!swaggerUrl) {
      return;
    }

    try {
      const result = await parseSpec.mutateAsync({ swaggerUrl });
      setParsedSpec(result.data);
      setShowEndpointSelection(true);
    } catch (error) {
      console.error('Failed to parse OpenAPI spec:', error);
    }
  };

  const handleSave = async (selectedEndpoints: string[], authConfig: any) => {
    try {
      await createAPI.mutateAsync({
        swaggerUrl,
        title: parsedSpec?.title,
        description: parsedSpec?.description,
        selectedEndpoints,
        auth: authConfig,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create API registry:', error);
    }
  };

  return (
    <>
      <OGDialog open={open && !showEndpointSelection} onOpenChange={onOpenChange}>
        <OGDialogTemplate
          title={api ? localize('com_ui_edit_api') : localize('com_ui_add_api')}
          description={localize('com_ui_api_registry_dialog_description')}
          className="w-11/12 md:max-w-2xl"
          main={
            <div className="space-y-4">
              <div>
                <Label htmlFor="swagger-url">
                  {localize('com_ui_swagger_url')}
                </Label>
                <Input
                  id="swagger-url"
                  type="url"
                  value={swaggerUrl}
                  onChange={(e) => setSwaggerUrl(e.target.value)}
                  placeholder="https://api.example.com/swagger.json"
                  className="mt-2"
                />
                <p className="mt-1 text-xs text-text-tertiary">
                  {localize('com_ui_swagger_url_help')}
                </p>
              </div>
            </div>
          }
          buttons={
            <Button
              type="button"
              variant="submit"
              onClick={handleParse}
              disabled={!swaggerUrl || parseSpec.isPending}
              className="text-white"
            >
              {parseSpec.isPending ? (
                <Spinner className="size-4" />
              ) : (
                localize('com_ui_parse_and_continue')
              )}
            </Button>
          }
        />
      </OGDialog>

      {parsedSpec && (
        <EndpointSelectionDialog
          open={showEndpointSelection}
          onOpenChange={setShowEndpointSelection}
          parsedSpec={parsedSpec}
          onSave={handleSave}
          onBack={() => setShowEndpointSelection(false)}
        />
      )}
    </>
  );
}