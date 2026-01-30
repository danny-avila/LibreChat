import React, { useState } from 'react';
import {
  OGDialog,
  OGDialogTemplate,
  OGDialogContent,
  Button,
  Checkbox,
  Label,
  Spinner,
} from '@librechat/client';
import { useLocalize } from '~/hooks';

interface EndpointSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parsedSpec: any;
  onSave: (selectedEndpoints: string[], authConfig: any) => Promise<void>;
  onBack: () => void;
}

export default function EndpointSelectionDialog({
  open,
  onOpenChange,
  parsedSpec,
  onSave,
  onBack,
}: EndpointSelectionDialogProps) {
  const localize = useLocalize();
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const endpoints = Object.entries(parsedSpec?.endpoints || {});

  const toggleEndpoint = (endpointKey: string) => {
    const newSelected = new Set(selectedEndpoints);
    if (newSelected.has(endpointKey)) {
      newSelected.delete(endpointKey);
    } else {
      newSelected.add(endpointKey);
    }
    setSelectedEndpoints(newSelected);
  };

  const handleSave = async () => {
    if (selectedEndpoints.size === 0) {
      return;
    }

    setIsSaving(true);
    try {
      // Detect auth from parsed spec
      const authConfig = detectAuthConfig(parsedSpec);
      await onSave(Array.from(selectedEndpoints), authConfig);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save API registry:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_select_endpoints')}
        description={`${parsedSpec?.title || 'API'} - ${localize('com_ui_select_endpoints_description')}`}
        className="w-11/12 md:max-w-3xl"
        main={
          <div className="space-y-4">
            <div className="rounded-lg border border-border-medium bg-surface-secondary p-3">
              <p className="text-sm text-text-secondary">
                <strong>{localize('com_ui_base_url')}:</strong> {parsedSpec?.baseUrl}
              </p>
              <p className="text-sm text-text-secondary">
                <strong>{localize('com_ui_total_endpoints')}:</strong> {endpoints.length}
              </p>
            </div>

            <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-border-medium p-4">
              {endpoints.map(([key, endpoint]: [string, any]) => (
                <div
                  key={key}
                  className="flex items-start gap-3 rounded-md border border-border-light p-3 hover:bg-surface-hover"
                >
                  <Checkbox
                    id={`endpoint-${key}`}
                    checked={selectedEndpoints.has(key)}
                    onCheckedChange={() => toggleEndpoint(key)}
                    className="mt-1"
                  />
                  <Label
                    htmlFor={`endpoint-${key}`}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="font-mono text-sm font-semibold text-text-primary">
                      <span className={`mr-2 ${getMethodColor(endpoint.method)}`}>
                        {endpoint.method}
                      </span>
                      {endpoint.path}
                    </div>
                    {endpoint.summary && (
                      <p className="mt-1 text-xs text-text-secondary">
                        {endpoint.summary}
                      </p>
                    )}
                  </Label>
                </div>
              ))}
            </div>

            <div className="text-sm text-text-secondary">
              {selectedEndpoints.size} {localize('com_ui_endpoints_selected')}
            </div>
          </div>
        }
        buttons={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSaving}
            >
              {localize('com_ui_back')}
            </Button>
            <Button
              type="button"
              variant="submit"
              onClick={handleSave}
              disabled={selectedEndpoints.size === 0 || isSaving}
              className="text-white"
            >
              {isSaving ? (
                <Spinner className="size-4" />
              ) : (
                localize('com_ui_save')
              )}
            </Button>
          </>
        }
      />
    </OGDialog>
  );
}

function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: 'text-blue-500',
    POST: 'text-green-500',
    PUT: 'text-yellow-500',
    PATCH: 'text-orange-500',
    DELETE: 'text-red-500',
  };
  return colors[method] || 'text-text-secondary';
}

function detectAuthConfig(parsedSpec: any): any {
  const authSchemes = parsedSpec?.authSchemes || [];
  
  if (authSchemes.length === 0) {
    return null;
  }

  const firstScheme = authSchemes[0];

  if (firstScheme.type === 'apiKey') {
    return {
      type: 'apiKey',
      source: 'user',
      headerName: firstScheme.in === 'header' ? firstScheme.name : 'X-API-Key',
    };
  }

  if (firstScheme.type === 'http') {
    if (firstScheme.scheme === 'bearer') {
      return {
        type: 'bearer',
        source: 'user',
      };
    }
    if (firstScheme.scheme === 'basic') {
      return {
        type: 'basic',
        source: 'user',
      };
    }
  }

  if (firstScheme.type === 'oauth2') {
    return {
      type: 'oauth2',
      source: 'user',
      oauth: {
        // OAuth details would need to be extracted from spec
        // For now, return basic structure
      },
    };
  }

  return null;
}