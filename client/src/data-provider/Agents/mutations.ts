import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, MutationKeys, QueryKeys, defaultOrderQuery } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

/**
 * AGENTS
 */

/**
 * Create a new agent
 */
export const useCreateAgentMutation = (
  options?: t.CreateAgentMutationOptions,
): UseMutationResult<t.Agent, Error, t.AgentCreateParams> => {
  const queryClient = useQueryClient();
  return useMutation((newAgentData: t.AgentCreateParams) => dataService.createAgent(newAgentData), {
    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onSuccess: (newAgent, variables, context) => {
      const listRes = queryClient.getQueryData<t.AgentListResponse>([
        QueryKeys.agents,
        defaultOrderQuery,
      ]);

      if (!listRes) {
        return options?.onSuccess?.(newAgent, variables, context);
      }

      const currentAgents = [newAgent, ...JSON.parse(JSON.stringify(listRes.data))];

      queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, defaultOrderQuery], {
        ...listRes,
        data: currentAgents,
      });
      return options?.onSuccess?.(newAgent, variables, context);
    },
  });
};

/**
 * Hook for updating an agent
 */
export const useUpdateAgentMutation = (
  options?: t.UpdateAgentMutationOptions,
): UseMutationResult<t.Agent, Error, { agent_id: string; data: t.AgentUpdateParams }> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ agent_id, data }: { agent_id: string; data: t.AgentUpdateParams }) => {
      return dataService.updateAgent({
        data,
        agent_id,
      });
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (updatedAgent, variables, context) => {
        const listRes = queryClient.getQueryData<t.AgentListResponse>([
          QueryKeys.agents,
          defaultOrderQuery,
        ]);

        if (!listRes) {
          return options?.onSuccess?.(updatedAgent, variables, context);
        }

        queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, defaultOrderQuery], {
          ...listRes,
          data: listRes.data.map((agent) => {
            if (agent.id === variables.agent_id) {
              return updatedAgent;
            }
            return agent;
          }),
        });

        queryClient.setQueryData<t.Agent>([QueryKeys.agent, variables.agent_id], updatedAgent);
        return options?.onSuccess?.(updatedAgent, variables, context);
      },
    },
  );
};

/**
 * Hook for deleting an agent
 */
export const useDeleteAgentMutation = (
  options?: t.DeleteAgentMutationOptions,
): UseMutationResult<void, Error, t.DeleteAgentBody> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ agent_id }: t.DeleteAgentBody) => {
      return dataService.deleteAgent({ agent_id });
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (_data, variables, context) => {
        const listRes = queryClient.getQueryData<t.AgentListResponse>([
          QueryKeys.agents,
          defaultOrderQuery,
        ]);

        if (!listRes) {
          return options?.onSuccess?.(_data, variables, context);
        }

        const data = listRes.data.filter((agent) => agent.id !== variables.agent_id);

        queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, defaultOrderQuery], {
          ...listRes,
          data,
        });

        return options?.onSuccess?.(_data, variables, data);
      },
    },
  );
};

/**
 * Hook for uploading an agent avatar
 */
export const useUploadAgentAvatarMutation = (
  options?: t.UploadAgentAvatarOptions,
): UseMutationResult<
  t.Agent, // response data
  unknown, // error
  t.AgentAvatarVariables, // request
  unknown // context
> => {
  return useMutation([MutationKeys.agentAvatarUpload], {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mutationFn: ({ postCreation, ...variables }: t.AgentAvatarVariables) =>
      dataService.uploadAgentAvatar(variables),
    ...(options || {}),
  });
};

/**
 * Hook for updating Agent Actions
 */
export const useUpdateAgentAction = (
  options?: t.UpdateAgentActionOptions,
): UseMutationResult<
  t.UpdateAgentActionResponse, // response data
  unknown, // error
  t.UpdateAgentActionVariables, // request
  unknown // context
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.updateAgentAction], {
    mutationFn: (variables: t.UpdateAgentActionVariables) =>
      dataService.updateAgentAction(variables),

    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onSuccess: (updateAgentActionResponse, variables, context) => {
      const listRes = queryClient.getQueryData<t.AgentListResponse>([
        QueryKeys.agents,
        defaultOrderQuery,
      ]);

      if (!listRes) {
        return options?.onSuccess?.(updateAgentActionResponse, variables, context);
      }

      const updatedAgent = updateAgentActionResponse[0];

      queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, defaultOrderQuery], {
        ...listRes,
        data: listRes.data.map((agent) => {
          if (agent.id === variables.agent_id) {
            return updatedAgent;
          }
          return agent;
        }),
      });

      queryClient.setQueryData<t.Action[]>([QueryKeys.actions], (prev) => {
        return prev
          ?.map((action) => {
            if (action.action_id === variables.action_id) {
              return updateAgentActionResponse[1];
            }
            return action;
          })
          .concat(
            variables.action_id != null && variables.action_id
              ? []
              : [updateAgentActionResponse[1]],
          );
      });

      return options?.onSuccess?.(updateAgentActionResponse, variables, context);
    },
  });
};

/**
 * Hook for deleting an Agent Action
 */

export const useDeleteAgentAction = (
  options?: t.DeleteAgentActionOptions,
): UseMutationResult<void, Error, t.DeleteAgentActionVariables, unknown> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.deleteAgentAction], {
    mutationFn: (variables: t.DeleteAgentActionVariables) => {
      return dataService.deleteAgentAction({
        ...variables,
      });
    },

    onMutate: (variables) => options?.onMutate?.(variables),
    onError: (error, variables, context) => options?.onError?.(error, variables, context),
    onSuccess: (_data, variables, context) => {
      let domain: string | undefined = '';
      queryClient.setQueryData<t.Action[]>([QueryKeys.actions], (prev) => {
        return prev?.filter((action) => {
          domain = action.metadata.domain;
          return action.action_id !== variables.action_id;
        });
      });

      queryClient.setQueryData<t.AgentListResponse>(
        [QueryKeys.agents, defaultOrderQuery],
        (prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            data: prev.data.map((agent) => {
              if (agent.id === variables.agent_id) {
                return {
                  ...agent,
                  tools: agent.tools?.filter((tool) => !tool.includes(domain ?? '')),
                };
              }
              return agent;
            }),
          };
        },
      );

      return options?.onSuccess?.(_data, variables, context);
    },
  });
};
