import React from 'react';
import { useLocalize } from '~/hooks';
import CustomUserVarsSection from './CustomUserVarsSection';

import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogDescription,
} from '~/components/ui/OriginalDialog';
import { MCPServerStatus } from 'librechat-data-provider/dist/types/types/queries';

export interface ConfigFieldDetail {
  title: string;
  description: string;
}

interface MCPConfigDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  fieldsSchema: Record<string, ConfigFieldDetail>;
  initialValues: Record<string, string>;
  onSave: (updatedValues: Record<string, string>) => void;
  isSubmitting?: boolean;
  onRevoke?: () => void;
  serverName: string;
  serverStatus?: MCPServerStatus;
  authConfig?: Array<{
    authField: string;
    label: string;
    description: string;
  }>;
}

export default function MCPConfigDialog({
  isOpen,
  onOpenChange,
  fieldsSchema,
  onSave,
  isSubmitting = false,
  onRevoke,
  serverName,
  serverStatus,
  authConfig,
}: MCPConfigDialogProps) {
  const localize = useLocalize();

  const hasFields = Object.keys(fieldsSchema).length > 0;
  const dialogTitle = hasFields
    ? localize('com_ui_configure_mcp_variables_for', { 0: serverName })
    : `${serverName} MCP Server`;
  const dialogDescription = hasFields
    ? localize('com_ui_mcp_dialog_desc')
    : `Manage connection and settings for the ${serverName} MCP server.`;

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent className="flex max-h-[90vh] w-full max-w-md flex-col">
        <OGDialogHeader>
          <div className="flex items-center gap-3">
            <OGDialogTitle>{dialogTitle}</OGDialogTitle>
            {serverStatus?.connectionState === 'connected' && (
              <div className="flex items-center gap-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span>{localize('com_ui_active')}</span>
              </div>
            )}
          </div>
          <OGDialogDescription>{dialogDescription}</OGDialogDescription>
        </OGDialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Custom User Variables Section */}
          <CustomUserVarsSection
            serverName={serverName}
            fields={fieldsSchema}
            onSave={onSave}
            onRevoke={onRevoke || (() => {})}
            isSubmitting={isSubmitting}
          />
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
