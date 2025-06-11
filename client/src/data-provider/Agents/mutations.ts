import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, MutationKeys, PERMISSION_BITS, QueryKeys } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { QueryClient, UseMutationResult } from '@tanstack/react-query';

/**
 * AGENTS
 */
export const allAgentViewAndEditQueryKeys: t.AgentListParams[] = [
  { requiredPermission: PERMISSION_BITS.VIEW },
  { requiredPermission: PERMISSION_BITS.EDIT },
];
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
      ((keys: t.AgentListParams[]) => {
        keys.forEach((key) => {
          const listRes = queryClient.getQueryData<t.AgentListResponse>([QueryKeys.agents, key]);
          if (!listRes) {
            return options?.onSuccess?.(newAgent, variables, context);
          }
          const currentAgents = [newAgent, ...JSON.parse(JSON.stringify(listRes.data))];

          queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, key], {
            ...listRes,
            data: currentAgents,
          });
        });
      })(allAgentViewAndEditQueryKeys);
      invalidateAgentMarketplaceQueries(queryClient);

      return options?.onSuccess?.(newAgent, variables, context);
    },
  });
};

/**
 * Hook for updating an agent
 */
export const useUpdateAgentMutation = (
  options?: t.UpdateAgentMutationOptions,
): UseMutationResult<
  t.Agent,
  t.DuplicateVersionError,
  { agent_id: string; data: t.AgentUpdateParams }
> => {
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
      onError: (error, variables, context) => {
        const typedError = error as t.DuplicateVersionError;
        return options?.onError?.(typedError, variables, context);
      },
      onSuccess: (updatedAgent, variables, context) => {
        ((keys: t.AgentListParams[]) => {
          keys.forEach((key) => {
            const listRes = queryClient.getQueryData<t.AgentListResponse>([QueryKeys.agents, key]);

            if (!listRes) {
              return options?.onSuccess?.(updatedAgent, variables, context);
            }

            queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, key], {
              ...listRes,
              data: listRes.data.map((agent) => {
                if (agent.id === variables.agent_id) {
                  return updatedAgent;
                }
                return agent;
              }),
            });
          });
        })(allAgentViewAndEditQueryKeys);

        queryClient.setQueryData<t.Agent>([QueryKeys.agent, variables.agent_id], updatedAgent);
        queryClient.setQueryData<t.Agent>(
          [QueryKeys.agent, variables.agent_id, 'expanded'],
          updatedAgent,
        );
        invalidateAgentMarketplaceQueries(queryClient);

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
        const data = ((keys: t.AgentListParams[]) => {
          let data: t.Agent[] = [];
          keys.forEach((key) => {
            const listRes = queryClient.getQueryData<t.AgentListResponse>([QueryKeys.agents, key]);

            if (!listRes) {
              return options?.onSuccess?.(_data, variables, context);
            }

            data = listRes.data.filter((agent) => agent.id !== variables.agent_id);

            queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, key], {
              ...listRes,
              data,
            });
          });
          return data;
        })(allAgentViewAndEditQueryKeys);

        queryClient.removeQueries([QueryKeys.agent, variables.agent_id]);
        queryClient.removeQueries([QueryKeys.agent, variables.agent_id, 'expanded']);
        invalidateAgentMarketplaceQueries(queryClient);

        return options?.onSuccess?.(_data, variables, data);
      },
    },
  );
};

/**
 * Hook for duplicating an agent
 */
export const useDuplicateAgentMutation = (
  options?: t.DuplicateAgentMutationOptions,
): UseMutationResult<{ agent: t.Agent; actions: t.Action[] }, Error, t.DuplicateAgentBody> => {
  const queryClient = useQueryClient();

  return useMutation<{ agent: t.Agent; actions: t.Action[] }, Error, t.DuplicateAgentBody>(
    (params: t.DuplicateAgentBody) => dataService.duplicateAgent(params),
    {
      onMutate: options?.onMutate,
      onError: options?.onError,
      onSuccess: ({ agent, actions }, variables, context) => {
        ((keys: t.AgentListParams[]) => {
          keys.forEach((key) => {
            const listRes = queryClient.getQueryData<t.AgentListResponse>([QueryKeys.agents, key]);
            if (listRes) {
              const currentAgents = [agent, ...listRes.data];
              queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, key], {
                ...listRes,
                data: currentAgents,
              });
            }
          });
        })(allAgentViewAndEditQueryKeys);

        const existingActions = queryClient.getQueryData<t.Action[]>([QueryKeys.actions]) || [];

        queryClient.setQueryData<t.Action[]>([QueryKeys.actions], existingActions.concat(actions));
        invalidateAgentMarketplaceQueries(queryClient);

        return options?.onSuccess?.({ agent, actions }, variables, context);
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
    mutationFn: (variables: t.AgentAvatarVariables) => dataService.uploadAgentAvatar(variables),
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
      const updatedAgent = updateAgentActionResponse[0];
      ((keys: t.AgentListParams[]) => {
        keys.forEach((key) => {
          const listRes = queryClient.getQueryData<t.AgentListResponse>([QueryKeys.agents, key]);

          if (!listRes) {
            return options?.onSuccess?.(updateAgentActionResponse, variables, context);
          }
          queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, key], {
            ...listRes,
            data: listRes.data.map((agent) => {
              if (agent.id === variables.agent_id) {
                return updatedAgent;
              }
              return agent;
            }),
          });
        });
      })(allAgentViewAndEditQueryKeys);

      queryClient.setQueryData<t.Action[]>([QueryKeys.actions], (prev) => {
        if (!prev) {
          return [updateAgentActionResponse[1]];
        }

        if (variables.action_id) {
          return prev.map((action) => {
            if (action.action_id === variables.action_id) {
              return updateAgentActionResponse[1];
            }
            return action;
          });
        }

        return [...prev, updateAgentActionResponse[1]];
      });

      queryClient.setQueryData<t.Agent>([QueryKeys.agent, variables.agent_id], updatedAgent);
      queryClient.setQueryData<t.Agent>(
        [QueryKeys.agent, variables.agent_id, 'expanded'],
        updatedAgent,
      );
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
      ((keys: t.AgentListParams[]) => {
        keys.forEach((key) => {
          queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, key], (prev) => {
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
          });
        });
      })(allAgentViewAndEditQueryKeys);
      const updaterFn = (prev) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          tools: prev.tools?.filter((tool) => !tool.includes(domain ?? '')),
        };
      };
      queryClient.setQueryData<t.Agent>([QueryKeys.agent, variables.agent_id], updaterFn);
      queryClient.setQueryData<t.Agent>(
        [QueryKeys.agent, variables.agent_id, 'expanded'],
        updaterFn,
      );
      return options?.onSuccess?.(_data, variables, context);
    },
  });
};

/**
 * Hook for reverting an agent to a previous version
 */
export const useRevertAgentVersionMutation = (
  options?: t.RevertAgentVersionOptions,
): UseMutationResult<t.Agent, Error, { agent_id: string; version_index: number }> => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ agent_id, version_index }: { agent_id: string; version_index: number }) => {
      return dataService.revertAgentVersion({
        agent_id,
        version_index,
      });
    },
    {
      onMutate: (variables) => options?.onMutate?.(variables),
      onError: (error, variables, context) => options?.onError?.(error, variables, context),
      onSuccess: (revertedAgent, variables, context) => {
        queryClient.setQueryData<t.Agent>([QueryKeys.agent, variables.agent_id], revertedAgent);

        ((keys: t.AgentListParams[]) => {
          keys.forEach((key) => {
            const listRes = queryClient.getQueryData<t.AgentListResponse>([QueryKeys.agents, key]);

            if (listRes) {
              queryClient.setQueryData<t.AgentListResponse>([QueryKeys.agents, key], {
                ...listRes,
                data: listRes.data.map((agent) => {
                  if (agent.id === variables.agent_id) {
                    return revertedAgent;
                  }
                  return agent;
                }),
              });
            }
          });
        })(allAgentViewAndEditQueryKeys);

        return options?.onSuccess?.(revertedAgent, variables, context);
      },
    },
  );
};

export const invalidateAgentMarketplaceQueries = (queryClient: QueryClient) => {
  queryClient.invalidateQueries([QueryKeys.marketplaceAgents]);
};
