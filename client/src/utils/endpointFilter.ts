import { EModelEndpoint } from 'librechat-data-provider';
import { ExtendedEndpoint } from '~/common';

export const filterMenuItems = (
  searchTerm: string,
  mappedEndpoints: ExtendedEndpoint[],
  agents: any[],
  assistants: any[],
  modelsData: any,
): ExtendedEndpoint[] => {
  if (!searchTerm.trim()) {
    return mappedEndpoints;
  }

  const lowercaseSearchTerm = searchTerm.toLowerCase();

  return mappedEndpoints
    .map((ep) => {
      if (ep.hasModels) {
        if (ep.value === EModelEndpoint.agents) {
          const filteredAgents = agents.filter((agent) =>
            agent.name?.toLowerCase().includes(lowercaseSearchTerm),
          );
          if (ep.label.toLowerCase().includes(lowercaseSearchTerm) || filteredAgents.length > 0) {
            return {
              ...ep,
              models: filteredAgents.map((agent) => agent.id),
              agentNames: filteredAgents.reduce((acc: Record<string, string>, agent) => {
                acc[agent.id] = agent.name || '';
                return acc;
              }, {}),
            };
          }
          return null;
        } else if (ep.value === EModelEndpoint.assistants) {
          const filteredAssistants = assistants.filter((assistant) =>
            assistant.name?.toLowerCase().includes(lowercaseSearchTerm),
          );
          if (
            ep.label.toLowerCase().includes(lowercaseSearchTerm) ||
            filteredAssistants.length > 0
          ) {
            return {
              ...ep,
              models: filteredAssistants.map((assistant) => assistant.id),
              assistantNames: filteredAssistants.reduce(
                (acc: Record<string, string>, assistant) => {
                  acc[assistant.id] = assistant.name || '';
                  return acc;
                },
                {},
              ),
            };
          }
          return null;
        } else {
          const allModels = modelsData?.[ep.value] ?? [];
          const filteredModels = allModels.filter((model: string) =>
            model.toLowerCase().includes(lowercaseSearchTerm),
          );
          if (ep.label.toLowerCase().includes(lowercaseSearchTerm) || filteredModels.length > 0) {
            return { ...ep, models: filteredModels };
          }
          return null;
        }
      } else {
        return ep.label.toLowerCase().includes(lowercaseSearchTerm) ? { ...ep, models: [] } : null;
      }
    })
    .filter(Boolean) as ExtendedEndpoint[];
};

export default filterMenuItems;
