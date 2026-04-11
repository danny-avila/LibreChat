import { useEffect, useMemo, useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { MCPServerCreateParams } from 'librechat-data-provider';
import {
  useCreateMCPServerMutation,
  useUpdateMCPServerMutation,
  useDeleteMCPServerMutation,
} from '~/data-provider/MCP';
import { useToastContext } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { extractServerNameFromUrl, isValidUrl, normalizeUrl } from '../utils/urlUtils';
import {
  buildCompleteConfig,
  deriveDefaultValues,
  getNewServerDefaults,
  AuthTypeEnum,
  AuthorizationTypeEnum,
} from '../utils/formHelpers';
import type { MCPServerDefinition } from '~/hooks';

// Re-export enums for backwards compatibility
export { AuthTypeEnum, AuthorizationTypeEnum };

// Auth configuration interface
export interface AuthConfig {
  auth_type: AuthTypeEnum;
  api_key?: string;
  api_key_source?: 'admin' | 'user';
  api_key_authorization_type?: AuthorizationTypeEnum;
  api_key_custom_header?: string;
  oauth_client_id?: string;
  oauth_client_secret?: string;
  oauth_authorization_url?: string;
  oauth_token_url?: string;
  oauth_scope?: string;
  server_id?: string;
}

export interface HeaderEntry {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface CustomUserVarEntry {
  key: string;
  title: string;
  description: string;
}

export type ServerInstructionsMode = 'none' | 'server' | 'custom';

// Form data interface
export interface MCPServerFormData {
  title: string;
  description?: string;
  icon?: string;
  url: string;
  type: 'streamable-http' | 'sse';
  auth: AuthConfig;
  trust: boolean;
  headers: HeaderEntry[];
  customUserVars: CustomUserVarEntry[];
  chatMenu: boolean;
  serverInstructionsMode: ServerInstructionsMode;
  serverInstructionsCustom: string;
}

interface UseMCPServerFormProps {
  server?: MCPServerDefinition | null;
  onSuccess?: (serverName: string, isOAuth: boolean) => void;
  onClose?: () => void;
}

export function useMCPServerForm({ server, onSuccess, onClose }: UseMCPServerFormProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  // Mutations
  const createMutation = useCreateMCPServerMutation();
  const updateMutation = useUpdateMCPServerMutation();
  const deleteMutation = useDeleteMCPServerMutation();

  // State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Check if editing existing server
  const isEditMode = !!server;

  // Default form values - use extracted helper functions
  const defaultValues = useMemo<MCPServerFormData>(() => {
    return server ? deriveDefaultValues(server) : getNewServerDefaults();
  }, [server]);

  // Form instance
  const methods = useForm<MCPServerFormData>({
    defaultValues,
    mode: 'onChange',
  });

  const { reset, watch, setValue, getValues } = methods;

  // Watch URL for auto-fill
  const watchedUrl = watch('url');

  // Auto-fill title from URL when title is empty
  const handleUrlChange = useCallback(
    (url: string) => {
      const currentTitle = getValues('title');
      if (!currentTitle && url) {
        const normalizedUrl = normalizeUrl(url);
        if (isValidUrl(normalizedUrl)) {
          const suggestedName = extractServerNameFromUrl(normalizedUrl);
          if (suggestedName) {
            setValue('title', suggestedName, { shouldValidate: true });
          }
        }
      }
    },
    [getValues, setValue],
  );

  // Watch for URL changes
  useEffect(() => {
    handleUrlChange(watchedUrl);
  }, [watchedUrl, handleUrlChange]);

  // Reset form when dialog opens
  const resetForm = useCallback(() => {
    reset(defaultValues);
  }, [reset, defaultValues]);

  // Handle form submission
  const onSubmit = methods.handleSubmit(async (formData: MCPServerFormData) => {
    setIsSubmitting(true);
    try {
      // Build config using extracted helper
      const config = buildCompleteConfig(formData, isEditMode);

      const params: MCPServerCreateParams = { config };

      const result = server
        ? await updateMutation.mutateAsync({ serverName: server.serverName, data: params })
        : await createMutation.mutateAsync(params);

      showToast({
        message: server
          ? localize('com_ui_mcp_server_updated')
          : localize('com_ui_mcp_server_created'),
        status: 'success',
      });

      const isOAuth = formData.auth.auth_type === AuthTypeEnum.OAuth;
      onSuccess?.(result.serverName, isOAuth && !server);
    } catch (error: unknown) {
      let errorMessage = localize('com_ui_error');

      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { error?: string } } };
        if (axiosError.response?.data?.error === 'MCP_INSPECTION_FAILED') {
          errorMessage = localize('com_ui_mcp_server_connection_failed');
        } else if (axiosError.response?.data?.error === 'MCP_DOMAIN_NOT_ALLOWED') {
          errorMessage = localize('com_ui_mcp_domain_not_allowed');
        } else if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      showToast({
        message: errorMessage,
        status: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  });

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!server) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync(server.serverName);

      showToast({
        message: localize('com_ui_mcp_server_deleted'),
        status: 'success',
      });

      onClose?.();
    } catch (error: unknown) {
      let errorMessage = localize('com_ui_error');

      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { error?: string } } };
        if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      showToast({
        message: errorMessage,
        status: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [server, deleteMutation, showToast, localize, onClose]);

  return {
    methods,
    isEditMode,
    isSubmitting,
    isDeleting,
    onSubmit,
    handleDelete,
    resetForm,
    server,
  };
}
