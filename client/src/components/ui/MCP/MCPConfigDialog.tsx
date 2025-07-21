import React, { useMemo } from 'react';
import { useLocalize } from '~/hooks';
import { useMCPConnectionStatusQuery } from '~/data-provider/Tools/queries';
import { CustomUserVarsSection, ServerInitializationSection } from './';

import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogDescription,
} from '~/components/ui/OriginalDialog';

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
  isConnected?: boolean;
  authConfig?: Array<{
    authField: string;
    label: string;
    description: string;
    requiresOAuth?: boolean;
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
}: MCPConfigDialogProps) {
  const localize = useLocalize();

  // Get connection status to determine OAuth requirements with aggressive refresh
  const { data: statusQuery } = useMCPConnectionStatusQuery({
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
    cacheTime: 0,
  });
  const mcpServerStatuses = statusQuery?.connectionStatus || {};

  // Derive real-time connection status and OAuth requirements
  const serverStatus = mcpServerStatuses[serverName];
  const isRealTimeConnected = serverStatus?.connected || false;
  const requiresOAuth = useMemo(() => {
    return serverStatus?.requiresOAuth || false;
  }, [serverStatus?.requiresOAuth]);

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
            {isRealTimeConnected && (
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

        {/* Server Initialization Section */}
        <ServerInitializationSection serverName={serverName} requiresOAuth={requiresOAuth} />
      </OGDialogContent>
    </OGDialog>
  );
}
