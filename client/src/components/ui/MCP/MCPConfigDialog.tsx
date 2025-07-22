import React from 'react';
import { Loader2, KeyRound, PlugZap, AlertTriangle } from 'lucide-react';
import { MCPServerStatus } from 'librechat-data-provider/dist/types/types/queries';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogDescription,
} from '~/components/ui/OriginalDialog';
import CustomUserVarsSection from './CustomUserVarsSection';
import ServerInitializationSection from './ServerInitializationSection';
import { useLocalize } from '~/hooks';

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
}: MCPConfigDialogProps) {
  const localize = useLocalize();

  const hasFields = Object.keys(fieldsSchema).length > 0;
  const dialogTitle = hasFields
    ? localize('com_ui_configure_mcp_variables_for', { 0: serverName })
    : `${serverName} MCP Server`;
  const dialogDescription = hasFields
    ? localize('com_ui_mcp_dialog_desc')
    : `Manage connection and settings for the ${serverName} MCP server.`;

  // Helper function to render status badge based on connection state
  const renderStatusBadge = () => {
    if (!serverStatus) {
      return null;
    }

    const { connectionState, requiresOAuth } = serverStatus;

    if (connectionState === 'connecting') {
      return (
        <div className="flex items-center gap-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-950 dark:text-blue-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{localize('com_ui_connecting')}</span>
        </div>
      );
    }

    if (connectionState === 'disconnected') {
      if (requiresOAuth) {
        return (
          <div className="flex items-center gap-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <KeyRound className="h-3 w-3" />
            <span>{localize('com_ui_oauth')}</span>
          </div>
        );
      } else {
        return (
          <div className="flex items-center gap-2 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600 dark:bg-orange-950 dark:text-orange-400">
            <PlugZap className="h-3 w-3" />
            <span>{localize('com_ui_offline')}</span>
          </div>
        );
      }
    }

    if (connectionState === 'error') {
      return (
        <div className="flex items-center gap-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-950 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" />
          <span>{localize('com_ui_error')}</span>
        </div>
      );
    }

    if (connectionState === 'connected') {
      return (
        <div className="flex items-center gap-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span>{localize('com_ui_active')}</span>
        </div>
      );
    }

    return null;
  };

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent className="flex max-h-[90vh] w-full max-w-md flex-col">
        <OGDialogHeader>
          <div className="flex items-center gap-3">
            <OGDialogTitle>{dialogTitle}</OGDialogTitle>
            {renderStatusBadge()}
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
        <ServerInitializationSection
          serverName={serverName}
          requiresOAuth={serverStatus?.requiresOAuth || false}
        />
      </OGDialogContent>
    </OGDialog>
  );
}
