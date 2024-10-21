import { EToolResources } from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  dataService,
  MutationKeys,
  defaultOrderQuery,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

export const useUploadFileMutation = (
  _options?: t.UploadMutationOptions,
  signal?: AbortSignal | null,
): UseMutationResult<
  t.TFileUpload, // response data
  unknown, // error
  FormData, // request
  unknown // context
> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...options } = _options || {};
  return useMutation([MutationKeys.fileUpload], {
    mutationFn: (body: FormData) => {
      const width = body.get('width') ?? '';
      const height = body.get('height') ?? '';
      const version = body.get('version') ?? '';
      const endpoint = (body.get('endpoint') ?? '') as string;
      if (isAssistantsEndpoint(endpoint) && version === '2') {
        return dataService.uploadFile(body, signal);
      }

      if (width !== '' && height !== '') {
        return dataService.uploadImage(body, signal);
      }

      return dataService.uploadFile(body, signal);
    },
    ...options,
    onSuccess: (data, formData, context) => {
      queryClient.setQueryData<t.TFile[] | undefined>([QueryKeys.files], (_files) => [
        data,
        ...(_files ?? []),
      ]);

      const endpoint = formData.get('endpoint');
      const message_file = formData.get('message_file');
      const agent_id = (formData.get('agent_id') as string | undefined) ?? '';
      const assistant_id = (formData.get('assistant_id') as string | undefined) ?? '';
      const tool_resource = (formData.get('tool_resource') as string | undefined) ?? '';

      if (message_file === 'true') {
        onSuccess?.(data, formData, context);
        return;
      }

      if (agent_id && tool_resource) {
        queryClient.setQueryData<t.Agent>([QueryKeys.agent, agent_id], (agent) => {
          if (!agent) {
            return agent;
          }

          const update = {};
          const prevResources = agent.tool_resources ?? {};
          const prevResource: t.ExecuteCodeResource | t.AgentFileSearchResource = agent
            .tool_resources?.[tool_resource] ?? {
            file_ids: [],
          };
          if (!prevResource.file_ids) {
            prevResource.file_ids = [];
          }
          prevResource.file_ids.push(data.file_id);
          update['tool_resources'] = {
            ...prevResources,
            [tool_resource]: prevResource,
          };
          return {
            ...agent,
            ...update,
          };
        });
      }

      if (!assistant_id) {
        onSuccess?.(data, formData, context);
        return;
      }

      queryClient.setQueryData<t.AssistantListResponse>(
        [QueryKeys.assistants, endpoint, defaultOrderQuery],
        (prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            data: prev.data.map((assistant) => {
              if (assistant.id !== assistant_id) {
                return assistant;
              }

              const update = {};
              if (!tool_resource) {
                update['file_ids'] = [...(assistant.file_ids ?? []), data.file_id];
              }
              if (tool_resource === EToolResources.code_interpreter) {
                const prevResources = assistant.tool_resources ?? {};
                const prevResource = assistant.tool_resources?.[tool_resource] ?? {
                  file_ids: [],
                };
                if (!prevResource.file_ids) {
                  prevResource.file_ids = [];
                }
                prevResource.file_ids.push(data.file_id);
                update['tool_resources'] = {
                  ...prevResources,
                  [tool_resource]: prevResource,
                };
              }
              return {
                ...assistant,
                ...update,
              };
            }),
          };
        },
      );
      onSuccess?.(data, formData, context);
    },
  });
};

export const useDeleteFilesMutation = (
  _options?: t.DeleteMutationOptions,
): UseMutationResult<
  t.DeleteFilesResponse, // response data
  unknown, // error
  t.DeleteFilesBody, // request
  unknown // context
> => {
  const queryClient = useQueryClient();
  const { onSuccess, ...options } = _options || {};
  return useMutation([MutationKeys.fileDelete], {
    mutationFn: (body: t.DeleteFilesBody) => dataService.deleteFiles(body),
    ...options,
    onSuccess: (data, vars, context) => {
      queryClient.setQueryData<t.TFile[] | undefined>([QueryKeys.files], (cachefiles) => {
        const { files: filesDeleted } = vars;

        const fileMap = filesDeleted.reduce((acc, file) => {
          acc.set(file.file_id, file);
          return acc;
        }, new Map<string, t.BatchFile>());

        return (cachefiles ?? []).filter((file) => !fileMap.has(file.file_id));
      });
      onSuccess?.(data, vars, context);
      if (vars.agent_id != null && vars.agent_id) {
        queryClient.refetchQueries([QueryKeys.agent, vars.agent_id]);
      }
    },
  });
};
