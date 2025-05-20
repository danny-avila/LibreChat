import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthType, Tools, QueryKeys, Constants } from 'librechat-data-provider';
import { useUpdateUserPluginsMutation } from 'librechat-data-provider/react-query';

export type SearchApiKeyFormData = {
  serperApiKey: string;
  firecrawlApiKey: string;
  firecrawlApiUrl: string;
  jinaApiKey: string;
  cohereApiKey: string;
};

const useAuthSearchTool = (options?: { isEntityTool: boolean }) => {
  const queryClient = useQueryClient();
  const isEntityTool = options?.isEntityTool ?? true;
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
    (data: SearchApiKeyFormData) => {
      const auth = Object.entries({
        [Constants.LC_VAR_PREFIX + 'SERPER_API_KEY']: data.serperApiKey,
        [Constants.LC_VAR_PREFIX + 'FIRECRAWL_API_KEY']: data.firecrawlApiKey,
        [Constants.LC_VAR_PREFIX + 'FIRECRAWL_API_URL']: data.firecrawlApiUrl,
        [Constants.LC_VAR_PREFIX + 'JINA_API_KEY']: data.jinaApiKey,
        [Constants.LC_VAR_PREFIX + 'COHERE_API_KEY']: data.cohereApiKey,
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
        isEntityTool,
      });
    },
    [updateUserPlugins, isEntityTool],
  );

  const removeTool = useCallback(() => {
    updateUserPlugins.mutate({
      pluginKey: Tools.web_search,
      action: 'uninstall',
      auth: {},
      isEntityTool,
    });
  }, [updateUserPlugins, isEntityTool]);

  return {
    removeTool,
    installTool,
  };
};

export default useAuthSearchTool;
