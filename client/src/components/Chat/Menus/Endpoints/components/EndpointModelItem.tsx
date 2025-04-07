import { isAgentsEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import { EarthIcon } from 'lucide-react';
import type { Endpoint } from '~/common';
import ClaudeIcon from '~/components/svg/ClaudeIcon';
import DeepseekColorIcon from '~/components/svg/DeepseekColorIcon';
import GeminiIcon from '~/components/svg/GeminiIcon';
import GPTIcon from '~/components/svg/GPTIcon';
import GrokIcon from '~/components/svg/GrokIcon';
import MetaIcon from '~/components/svg/MetaIcon';
import PerplexityIcon from '~/components/svg/PerplexityIcon';
import { CustomMenuItem as MenuItem } from '../CustomMenu';
import { useModelSelectorContext } from '../ModelSelectorContext';
interface EndpointModelItemProps {
  modelId: string | null;
  endpoint: Endpoint;
  isSelected: boolean;
}

export function EndpointModelItem({ modelId, endpoint, isSelected }: EndpointModelItemProps) {
  const { handleSelectModel } = useModelSelectorContext();
  let isGlobal = false;
  let modelName = modelId;
  const avatarUrl = endpoint?.modelIcons?.[modelId ?? ''] || null;

  // Use custom names if available
  if (endpoint && modelId && isAgentsEndpoint(endpoint.value) && endpoint.agentNames?.[modelId]) {
    modelName = endpoint.agentNames[modelId];

    const modelInfo = endpoint?.models?.find((m) => m.name === modelId);
    isGlobal = modelInfo?.isGlobal ?? false;
  } else if (
    endpoint &&
    modelId &&
    isAssistantsEndpoint(endpoint.value) &&
    endpoint.assistantNames?.[modelId]
  ) {
    modelName = endpoint.assistantNames[modelId];
  }

  return (
    <MenuItem
      key={modelId}
      onClick={() => handleSelectModel(endpoint, modelId ?? '')}
      className="flex h-8 w-full cursor-pointer items-center justify-start rounded-lg px-3 py-2 text-sm"
    >
      <div className="flex items-center gap-2">
        {modelId?.startsWith('deepseek/') ? (
          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
            <DeepseekColorIcon />
          </div>
        ) : modelId?.startsWith('x-ai/') ? (
          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
            <GrokIcon />
          </div>
        ) : modelId?.startsWith('openai/') ? (
          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
            <GPTIcon />
          </div>
        ) : modelId?.startsWith('anthropic/') ? (
          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
            <ClaudeIcon />
          </div>
        ) : modelId?.startsWith('perplexity/') ? (
          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
            <PerplexityIcon />
          </div>
        ) : modelId?.startsWith('meta-llama/') ? (
          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
            <MetaIcon />
          </div>
        ) : modelId?.startsWith('google/') ? (  
          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
            <GeminiIcon />
          </div>
        ) : null}
        <span>{modelName?.toLowerCase().includes(':free') ? <strong><i>{modelName}</i></strong> : modelName}</span>
      </div>
      {isGlobal && <EarthIcon className="ml-auto size-4 text-green-400" />}
      {isSelected && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="block"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
            fill="currentColor"
          />
        </svg>
      )}
    </MenuItem>
  );
}

export function renderEndpointModels(
  endpoint: Endpoint | null,
  models: Array<{ name: string; isGlobal?: boolean }>,
  selectedModel: string | null,
  filteredModels?: string[],
) {
  const modelsToRender = filteredModels || models.map((model) => model.name);

  const sortedModels = [...modelsToRender].sort((a, b) => {
    // Get provider (text before "/") for each model
    const aProvider = a.split('/')[0];
    const bProvider = b.split('/')[0];

    // Define provider order
    const providerOrder = {
      'anthropic': 1,
      'openai': 2,
      'x-ai': 3,
      'deepseek': 4,
      'perplexity': 5,
      'meta-llama': 6,
      'google': 7,
    };

    // Get provider order values, defaulting to 6 for any other provider
    const aOrder = providerOrder[aProvider] || 6;
    const bOrder = providerOrder[bProvider] || 6;

    // First sort by provider order
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    // Then sort by model name in descending order
    return b.localeCompare(a);
  });

  return sortedModels.map(
    (modelId) =>
      endpoint && (
        <EndpointModelItem
          key={modelId}
          modelId={modelId}
          endpoint={endpoint}
          isSelected={selectedModel === modelId}
        />
      ),
  );
}
