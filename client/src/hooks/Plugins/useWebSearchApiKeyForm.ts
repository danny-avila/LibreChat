import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { AuthType, Tools, QueryKeys } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';

export type WebSearchApiKeyFormData = {
  serperApiKey: string;
  firecrawlApiKey: string;
  firecrawlApiUrl: string;
  jinaApiKey: string;
  cohereApiKey: string;
};

export default function useWebSearchApiKeyForm({
  onSubmit,
  onRevoke,
}: {
  onSubmit?: () => void;
  onRevoke?: () => void;
}) {
  const methods = useForm<WebSearchApiKeyFormData>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { reset } = methods;

  const updateUserPlugins = useUpdateUserPluginsMutation({
    onMutate: (vars) => {
      queryClient.setQueryData([QueryKeys.toolAuth, Tools.web_search], () => ({
        authenticated: vars.action === 'install',
        message: AuthType.USER_PROVIDED,
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.toolAuth, Tools.web_search]);
    },
    onError: () => {
      queryClient.invalidateQueries([QueryKeys.toolAuth, Tools.web_search]);
    },
  });

  const installTool = useCallback(
    (data: WebSearchApiKeyFormData) => {
      // Filter out empty values
      const auth = Object.entries({
        serperApiKey: data.serperApiKey,
        firecrawlApiKey: data.firecrawlApiKey,
        firecrawlApiUrl: data.firecrawlApiUrl,
        jinaApiKey: data.jinaApiKey,
        cohereApiKey: data.cohereApiKey,
      }).reduce(
        (acc, [key, value]) => {
          if (value) {
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, string>,
      );

      updateUserPlugins.mutate({
        pluginKey: Tools.web_search,
        action: 'install',
        auth,
        isEntityTool: true,
      });
    },
    [updateUserPlugins],
  );

  const removeTool = useCallback(() => {
    updateUserPlugins.mutate({
      pluginKey: Tools.web_search,
      action: 'uninstall',
      auth: {},
      isEntityTool: true,
    });
  }, [updateUserPlugins]);

  const onSubmitHandler = useCallback(
    (data: WebSearchApiKeyFormData) => {
      reset();
      installTool(data);
      setIsDialogOpen(false);
      onSubmit?.();
    },
    [onSubmit, reset, installTool],
  );

  const handleRevokeApiKey = useCallback(() => {
    reset();
    removeTool();
    setIsDialogOpen(false);
    onRevoke?.();
  }, [reset, onRevoke, removeTool]);

  return {
    methods,
    isDialogOpen,
    setIsDialogOpen,
    handleRevokeApiKey,
    onSubmit: onSubmitHandler,
  };
}
