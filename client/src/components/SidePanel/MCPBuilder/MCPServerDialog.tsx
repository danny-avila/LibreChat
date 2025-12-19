import React, { useState, useEffect, useMemo } from 'react';
import { FormProvider, useForm, Controller } from 'react-hook-form';
import * as RadioGroup from '@radix-ui/react-radio-group';
import type { MCPServerCreateParams } from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogTemplate,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  TrashIcon,
  Button,
  Label,
  Checkbox,
  Spinner,
  useToastContext,
} from '@librechat/client';
import {
  useCreateMCPServerMutation,
  useUpdateMCPServerMutation,
  useDeleteMCPServerMutation,
} from '~/data-provider/MCP';
import MCPAuth, { type AuthConfig, AuthTypeEnum, AuthorizationTypeEnum } from './MCPAuth';
import MCPIcon from '~/components/SidePanel/Agents/MCPIcon';
import { useLocalize, useLocalizedConfig } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import { cn } from '~/utils';
import {
  SystemRoles,
  Permissions,
  ResourceType,
  PermissionBits,
  PermissionTypes,
} from 'librechat-data-provider';
import { GenericGrantAccessDialog } from '~/components/Sharing';
import { useAuthContext, useHasAccess, useResourcePermissions, MCPServerDefinition } from '~/hooks';

// Form data with nested auth structure matching AuthConfig
interface MCPServerFormData {
  // Server metadata
  title: string;
  description?: string;
  icon?: string;

  // Connection details
  url: string;
  type: 'streamable-http' | 'sse';

  // Nested auth configuration (matches AuthConfig directly)
  auth: AuthConfig;

  // UI-only validation
  trust: boolean;
}

interface MCPServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  triggerRef?: React.MutableRefObject<HTMLButtonElement | null>;
  server?: MCPServerDefinition | null;
}

export default function MCPServerDialog({
  open,
  onOpenChange,
  children,
  triggerRef,
  server,
}: MCPServerDialogProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();
  const getLocalizedValue = useLocalizedConfig();

  // Mutations
  const createMutation = useCreateMCPServerMutation();
  const updateMutation = useUpdateMCPServerMutation();
  const deleteMutation = useDeleteMCPServerMutation();

  // Convert McpServer to form data
  const defaultValues = useMemo<MCPServerFormData>(() => {
    if (server) {
      // Determine auth type from server config
      let authType: AuthTypeEnum = AuthTypeEnum.None;
      if (server.config.oauth) {
        authType = AuthTypeEnum.OAuth;
      } else if ('apiKey' in server.config && server.config.apiKey) {
        authType = AuthTypeEnum.ServiceHttp;
      }

      // Extract apiKey config if present
      const apiKeyConfig = 'apiKey' in server.config ? server.config.apiKey : undefined;

      return {
        title: server.config.title || '',
        description: server.config.description || '',
        url: 'url' in server.config ? server.config.url : '',
        type: (server.config.type as 'streamable-http' | 'sse') || 'streamable-http',
        icon: server.config.iconPath || '',
        auth: {
          auth_type: authType,
          api_key: '', // NEVER pre-fill secrets
          api_key_source: (apiKeyConfig?.source as 'admin' | 'user') || 'admin',
          api_key_authorization_type:
            (apiKeyConfig?.authorization_type as AuthorizationTypeEnum) ||
            AuthorizationTypeEnum.Bearer,
          api_key_custom_header: apiKeyConfig?.custom_header || '',
          oauth_client_id: server.config.oauth?.client_id || '',
          oauth_client_secret: '', // NEVER pre-fill secrets
          oauth_authorization_url: server.config.oauth?.authorization_url || '',
          oauth_token_url: server.config.oauth?.token_url || '',
          oauth_scope: server.config.oauth?.scope || '',
          server_id: server.serverName, // For edit mode redirect URI
        },
        trust: true, // Pre-check for existing servers
      };
    }
    return {
      title: '',
      description: '',
      url: '',
      type: 'streamable-http',
      icon: '',
      auth: {
        auth_type: AuthTypeEnum.None,
        api_key: '',
        api_key_source: 'admin',
        api_key_authorization_type: AuthorizationTypeEnum.Bearer,
        api_key_custom_header: '',
        oauth_client_id: '',
        oauth_client_secret: '',
        oauth_authorization_url: '',
        oauth_token_url: '',
        oauth_scope: '',
      },
      trust: false,
    };
  }, [server]);

  const methods = useForm<MCPServerFormData>({
    defaultValues,
  });

  const {
    handleSubmit,
    register,
    formState: { errors },
    control,
    watch,
    reset,
  } = methods;

  const iconValue = watch('icon');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRedirectUriDialog, setShowRedirectUriDialog] = useState(false);
  const [createdServerId, setCreatedServerId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset form when dialog opens or server changes
  useEffect(() => {
    if (open) {
      reset(defaultValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultValues is derived from server
  }, [open, server, reset]);

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        methods.setValue('icon', base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDelete = async () => {
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

      setShowDeleteConfirm(false);
      onOpenChange(false);

      setTimeout(() => {
        triggerRef?.current?.focus();
      }, 0);
    } catch (error: any) {
      let errorMessage = localize('com_ui_error');

      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      showToast({
        message: errorMessage,
        status: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const onSubmit = handleSubmit(async (formData: MCPServerFormData) => {
    setIsSubmitting(true);
    try {
      // Convert form data to API params - everything goes in config now
      const config: any = {
        type: formData.type,
        url: formData.url,
        title: formData.title,
        ...(formData.description && { description: formData.description }),
        ...(formData.icon && { iconPath: formData.icon }),
      };

      // Add OAuth if auth type is oauth and any fields are filled
      if (
        formData.auth.auth_type === AuthTypeEnum.OAuth &&
        (formData.auth.oauth_client_id ||
          formData.auth.oauth_client_secret ||
          formData.auth.oauth_authorization_url ||
          formData.auth.oauth_token_url ||
          formData.auth.oauth_scope)
      ) {
        config.oauth = {};
        if (formData.auth.oauth_client_id) {
          config.oauth.client_id = formData.auth.oauth_client_id;
        }
        if (formData.auth.oauth_client_secret) {
          config.oauth.client_secret = formData.auth.oauth_client_secret;
        }
        if (formData.auth.oauth_authorization_url) {
          config.oauth.authorization_url = formData.auth.oauth_authorization_url;
        }
        if (formData.auth.oauth_token_url) {
          config.oauth.token_url = formData.auth.oauth_token_url;
        }
        if (formData.auth.oauth_scope) {
          config.oauth.scope = formData.auth.oauth_scope;
        }
      }

      // Add API Key if auth type is service_http
      if (formData.auth.auth_type === AuthTypeEnum.ServiceHttp) {
        const source = formData.auth.api_key_source || 'admin';
        const authorizationType = formData.auth.api_key_authorization_type || 'bearer';

        config.apiKey = {
          source,
          authorization_type: authorizationType,
          ...(source === 'admin' && formData.auth.api_key && { key: formData.auth.api_key }),
          ...(authorizationType === 'custom' &&
            formData.auth.api_key_custom_header && {
              custom_header: formData.auth.api_key_custom_header,
            }),
        };
      }

      const params: MCPServerCreateParams = {
        config,
      };

      // Call mutation based on create vs edit mode
      const result = server
        ? await updateMutation.mutateAsync({ serverName: server.serverName, data: params })
        : await createMutation.mutateAsync(params);

      showToast({
        message: server
          ? localize('com_ui_mcp_server_updated')
          : localize('com_ui_mcp_server_created'),
        status: 'success',
      });

      // Show redirect URI dialog only on creation with OAuth
      if (!server && formData.auth.auth_type === AuthTypeEnum.OAuth) {
        setCreatedServerId(result.serverName);
        setShowRedirectUriDialog(true);
      } else {
        onOpenChange(false);
      }

      setTimeout(() => {
        triggerRef?.current?.focus();
      }, 0);
    } catch (error: any) {
      let errorMessage = localize('com_ui_error');

      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        if (axiosError.response?.data?.error === 'MCP_INSPECTION_FAILED') {
          errorMessage = localize('com_ui_mcp_server_connection_failed');
        } else if (axiosError.response?.data?.error === 'MCP_DOMAIN_NOT_ALLOWED') {
          errorMessage = localize('com_ui_mcp_domain_not_allowed');
        } else if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error;
        }
      } else if (error.message) {
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
  const { user } = useAuthContext();

  // Check global permission to share MCP servers
  const hasAccessToShareMcpServers = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.SHARE,
  });

  // Check user's permissions on this specific MCP server
  const { hasPermission, isLoading: permissionsLoading } = useResourcePermissions(
    ResourceType.MCPSERVER,
    server?.dbId || '',
  );

  const canShareThisServer = hasPermission(PermissionBits.SHARE);

  const shouldShowShareButton =
    server && // Only in edit mode
    (user?.role === SystemRoles.ADMIN || canShareThisServer) &&
    hasAccessToShareMcpServers &&
    !permissionsLoading;

  const redirectUri = createdServerId
    ? `${window.location.origin}/api/mcp/${createdServerId}/oauth/callback`
    : '';

  return (
    <>
      {/* Delete confirmation dialog */}
      <OGDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          setShowDeleteConfirm(open);
        }}
      >
        <OGDialogTemplate
          title={localize('com_ui_delete')}
          className="max-w-[450px]"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_ui_mcp_server_delete_confirm')}
            </Label>
          }
          selection={{
            selectHandler: handleDelete,
            selectClasses:
              'bg-destructive text-white transition-all duration-200 hover:bg-destructive/80',
            selectText: isDeleting ? <Spinner /> : localize('com_ui_delete'),
          }}
        />
      </OGDialog>

      {/* Post-creation redirect URI dialog */}
      <OGDialog
        open={showRedirectUriDialog}
        onOpenChange={(open) => {
          setShowRedirectUriDialog(open);
          if (!open) {
            onOpenChange(false);
            setCreatedServerId(null);
          }
        }}
      >
        <OGDialogContent className="w-full max-w-lg border-none bg-surface-primary text-text-primary">
          <OGDialogHeader className="border-b border-border-light sm:p-3">
            <OGDialogTitle>{localize('com_ui_mcp_server_created')}</OGDialogTitle>
          </OGDialogHeader>
          <div className="p-4 sm:p-6 sm:pt-4">
            <p className="mb-4 text-sm text-text-primary">
              {localize('com_ui_redirect_uri_instructions')}
            </p>
            <div className="rounded-lg border border-border-medium bg-surface-secondary p-3">
              <label className="mb-2 block text-xs font-medium text-text-secondary">
                {localize('com_ui_redirect_uri')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 rounded border border-border-medium bg-surface-primary px-3 py-2 text-sm"
                  value={redirectUri}
                  readOnly
                />
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(redirectUri);
                    showToast({
                      message: localize('com_ui_copied'),
                      status: 'success',
                    });
                  }}
                  variant="outline"
                  className="whitespace-nowrap"
                >
                  {localize('com_ui_copy_link')}
                </Button>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => {
                  setShowRedirectUriDialog(false);
                  onOpenChange(false);
                  setCreatedServerId(null);
                }}
                variant="submit"
                className="text-white"
              >
                {localize('com_ui_done')}
              </Button>
            </div>
          </div>
        </OGDialogContent>
      </OGDialog>

      {/* Main MCP Server Dialog */}
      <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
        {children}
        <OGDialogTemplate
          title={server ? localize('com_ui_edit_mcp_server') : localize('com_ui_add_mcp_server')}
          description={
            server
              ? localize('com_ui_edit_mcp_server_dialog_description', {
                  serverName: server.serverName,
                })
              : undefined
          }
          className="w-11/12 md:max-w-2xl"
          main={
            <FormProvider {...methods}>
              <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1">
                {/* Icon Picker */}
                <div>
                  <MCPIcon icon={iconValue} onIconChange={handleIconChange} />
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-medium">
                    {localize('com_ui_name')} <span className="text-red-500">*</span>
                  </Label>
                  <input
                    autoComplete="off"
                    {...register('title', {
                      required: true,
                      pattern: {
                        value: /^[a-zA-Z0-9 ]+$/,
                        message: localize('com_ui_mcp_title_invalid'),
                      },
                    })}
                    className="border-token-border-medium flex h-9 w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
                    placeholder={localize('com_agents_mcp_name_placeholder')}
                  />
                  {errors.title && (
                    <span className="text-xs text-red-500">
                      {errors.title.type === 'pattern'
                        ? errors.title.message
                        : localize('com_ui_field_required')}
                    </span>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">
                    {localize('com_ui_description')}
                    <span className="ml-1 text-xs text-text-secondary-alt">
                      {localize('com_ui_optional')}
                    </span>
                  </Label>
                  <input
                    id="description"
                    {...register('description')}
                    className="border-token-border-medium flex h-9 w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
                    placeholder={localize('com_agents_mcp_description_placeholder')}
                  />
                </div>

                {/* URL */}
                <div className="space-y-2">
                  <Label htmlFor="url" className="text-sm font-medium">
                    {localize('com_ui_mcp_url')} <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="url"
                    {...register('url', {
                      required: true,
                    })}
                    className="border-token-border-medium flex h-9 w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
                    placeholder="https://mcp.example.com"
                  />
                  {errors.url && (
                    <span className="text-xs text-red-500">
                      {errors.url.type === 'required'
                        ? localize('com_ui_field_required')
                        : errors.url.message}
                    </span>
                  )}
                </div>

                {/* Server Type */}
                <div className="space-y-2">
                  <Label htmlFor="type" className="text-sm font-medium">
                    {localize('com_ui_mcp_server_type')}
                  </Label>
                  <Controller
                    name="type"
                    control={control}
                    render={({ field }) => (
                      <RadioGroup.Root
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="type-streamable-http"
                            className="flex cursor-pointer items-center gap-1"
                          >
                            <RadioGroup.Item
                              type="button"
                              value="streamable-http"
                              id="type-streamable-http"
                              className={cn(
                                'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                                'border-border-heavy bg-surface-primary',
                              )}
                            >
                              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
                            </RadioGroup.Item>
                            {localize('com_ui_mcp_type_streamable_http')}
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="type-sse"
                            className="flex cursor-pointer items-center gap-1"
                          >
                            <RadioGroup.Item
                              type="button"
                              value="sse"
                              id="type-sse"
                              className={cn(
                                'mr-1 flex h-5 w-5 items-center justify-center rounded-full border',
                                'border-border-heavy bg-surface-primary',
                              )}
                            >
                              <RadioGroup.Indicator className="h-2 w-2 rounded-full bg-text-primary" />
                            </RadioGroup.Item>
                            {localize('com_ui_mcp_type_sse')}
                          </label>
                        </div>
                      </RadioGroup.Root>
                    )}
                  />
                </div>

                {/* Authentication */}
                <Controller
                  name="auth"
                  control={control}
                  render={({ field }) => <MCPAuth value={field.value} onChange={field.onChange} />}
                />

                {/* Trust Checkbox */}
                <div className="flex items-center gap-2">
                  <Controller
                    name="trust"
                    control={control}
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Checkbox
                        id="trust"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-labelledby="trust-this-mcp-label"
                      />
                    )}
                  />
                  <Label
                    id="trust-this-mcp-label"
                    htmlFor="trust"
                    className="flex cursor-pointer flex-col break-words text-sm font-medium"
                  >
                    <span>
                      {startupConfig?.interface?.mcpServers?.trustCheckbox?.label ? (
                        <span
                          /** No sanitization required. trusted admin-controlled source (yml)  */
                          dangerouslySetInnerHTML={{
                            __html: getLocalizedValue(
                              startupConfig.interface.mcpServers.trustCheckbox.label,
                              localize('com_ui_trust_app'),
                            ),
                          }}
                        />
                      ) : (
                        localize('com_ui_trust_app')
                      )}{' '}
                      <span className="text-red-500">*</span>
                    </span>
                    <span className="text-xs font-normal text-text-secondary">
                      {startupConfig?.interface?.mcpServers?.trustCheckbox?.subLabel ? (
                        <span
                          /** No sanitization required. trusted admin-controlled source (yml)  */
                          dangerouslySetInnerHTML={{
                            __html: getLocalizedValue(
                              startupConfig.interface.mcpServers.trustCheckbox.subLabel,
                              localize('com_agents_mcp_trust_subtext'),
                            ),
                          }}
                        />
                      ) : (
                        localize('com_agents_mcp_trust_subtext')
                      )}
                    </span>
                  </Label>
                </div>
                {errors.trust && (
                  <span className="text-xs text-red-500">{localize('com_ui_field_required')}</span>
                )}
              </div>
            </FormProvider>
          }
          footerClassName="sm:justify-between"
          leftButtons={
            server ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Delete MCP server"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSubmitting || isDeleting}
                >
                  <div className="flex w-full items-center justify-center gap-2 text-red-500">
                    <TrashIcon />
                  </div>
                </Button>
                {shouldShowShareButton && (
                  <GenericGrantAccessDialog
                    resourceDbId={server.dbId}
                    resourceName={server.config.title || ''}
                    resourceType={ResourceType.MCPSERVER}
                  />
                )}
              </div>
            ) : null
          }
          buttons={
            <Button
              type="button"
              variant="submit"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="text-white"
            >
              {isSubmitting ? (
                <Spinner className="size-4" />
              ) : (
                localize(server ? 'com_ui_update' : 'com_ui_create')
              )}
            </Button>
          }
        />
      </OGDialog>
    </>
  );
}
