import React from 'react';
import { KeyRound, PlugZap, AlertTriangle } from 'lucide-react';
import {
  Spinner,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
} from '@librechat/client';
import type { MCPServerStatus } from 'librechat-data-provider';
import ServerInitializationSection from './ServerInitializationSection';
import CustomUserVarsSection from './CustomUserVarsSection';
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

  // Helper function to render status badge based on connection state
  const renderStatusBadge = () => {
    if (!serverStatus) {
      return null;
    }

    const { connectionState, requiresOAuth } = serverStatus;

    if (connectionState === 'connecting') {
      return (
        <div className="flex items-center gap-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-950 dark:text-blue-400">
          <Spinner className="h-3 w-3" />
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
      <OGDialogContent className="flex max-h-screen w-11/12 max-w-lg flex-col space-y-2">
        <OGDialogHeader>
          <div className="flex items-center gap-3">
            <OGDialogTitle className="text-xl">
              {dialogTitle.charAt(0).toUpperCase() + dialogTitle.slice(1)}
            </OGDialogTitle>
            {renderStatusBadge()}
          </div>
        </OGDialogHeader>

        {/* Custom User Variables Section */}
        <CustomUserVarsSection
          serverName={serverName}
          fields={fieldsSchema}
          onSave={onSave}
          onRevoke={onRevoke || (() => {})}
          isSubmitting={isSubmitting}
        />

        {/* Server Initialization Section */}
        <ServerInitializationSection
          serverName={serverName}
          requiresOAuth={serverStatus?.requiresOAuth || false}
          hasCustomUserVars={fieldsSchema && Object.keys(fieldsSchema).length > 0}
        />
      </OGDialogContent>
    </OGDialog>
  );
}
