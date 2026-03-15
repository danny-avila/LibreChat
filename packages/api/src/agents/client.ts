import { logger } from '@librechat/data-schemas';
import { isAgentsEndpoint } from 'librechat-data-provider';
import {
  labelContentByAgent,
  extractImageDimensions,
  getTokenCountForMessage,
  estimateOpenAIImageTokens,
  estimateAnthropicImageTokens,
} from '@librechat/agents';
import type { MessageContentComplex } from '@librechat/agents';
import type { Agent, TMessage } from 'librechat-data-provider';
import type { BaseMessage } from '@langchain/core/messages';
import type { ServerRequest } from '~/types';
import Tokenizer from '~/utils/tokenizer';
import { logAxiosError } from '~/utils';

export const omitTitleOptions = new Set([
  'stream',
  'thinking',
  'streaming',
  'clientOptions',
  'thinkingConfig',
  'thinkingBudget',
  'includeThoughts',
  'maxOutputTokens',
  'additionalModelRequestFields',
]);

export function payloadParser({ req, endpoint }: { req: ServerRequest; endpoint: string }) {
  if (isAgentsEndpoint(endpoint)) {
    return;
  }
  return req.body?.endpointOption?.model_parameters;
}

/**
 * Anthropic's API consistently reports ~10% more tokens than the local
 * claude tokenizer due to internal message framing and content encoding.
 * Verified empirically across content types via the count_tokens endpoint.
 */
const CLAUDE_TOKEN_CORRECTION = 1.1;
const IMAGE_TOKEN_SAFETY_MARGIN = 1.05;
const BASE64_BYTES_PER_PDF_PAGE = 75_000;
const PDF_TOKENS_PER_PAGE_CLAUDE = 2000;
const PDF_TOKENS_PER_PAGE_OPENAI = 1500;
const URL_DOCUMENT_FALLBACK_TOKENS = 2000;

type ContentBlock = {
  type?: string;
  image_url?: string | { url?: string };
  source?: { type?: string; data?: string; media_type?: string; content?: unknown[] };
  source_type?: string;
  mime_type?: string;
  data?: string;
  text?: string;
};

/**
 * Estimates token cost for image and document blocks in a message's
 * content array that BaseClient.getTokenCountForMessage skips.
 * Covers: image_url, image, image_file, document, file.
 */
export function estimateMediaTokensForMessage(
  content: unknown,
  isClaude: boolean,
  getTokenCount?: (text: string) => number,
): number {
  if (!Array.isArray(content)) {
    return 0;
  }
  let tokens = 0;
  const pdfPerPage = isClaude ? PDF_TOKENS_PER_PAGE_CLAUDE : PDF_TOKENS_PER_PAGE_OPENAI;

  for (const block of content as ContentBlock[]) {
    if (block == null || typeof block !== 'object' || typeof block.type !== 'string') {
      continue;
    }
    const type = block.type;

    if (type === 'image_url' || type === 'image' || type === 'image_file') {
      let base64Data: string | undefined;
      if (type === 'image_url') {
        const url = typeof block.image_url === 'string' ? block.image_url : block.image_url?.url;
        if (typeof url === 'string' && url.startsWith('data:')) {
          base64Data = url;
        }
      } else if (type === 'image') {
        if (block.source?.type === 'base64' && typeof block.source.data === 'string') {
          base64Data = block.source.data;
        }
      }

      if (base64Data == null) {
        tokens += 1024;
        continue;
      }
      const dims = extractImageDimensions(base64Data);
      if (dims == null) {
        tokens += 1024;
        continue;
      }
      const imgTokens = isClaude
        ? estimateAnthropicImageTokens(dims.width, dims.height)
        : estimateOpenAIImageTokens(dims.width, dims.height);
      tokens += Math.ceil(imgTokens * IMAGE_TOKEN_SAFETY_MARGIN);
      continue;
    }

    if (type === 'document' || type === 'file') {
      // LangChain standard format
      if (typeof block.source_type === 'string') {
        if (block.source_type === 'text' && typeof block.text === 'string') {
          tokens +=
            getTokenCount != null ? getTokenCount(block.text) : Math.ceil(block.text.length / 4);
          continue;
        }
        if (block.source_type === 'base64' && typeof block.data === 'string') {
          const mime = (block.mime_type ?? '').split(';')[0];
          if (mime === 'application/pdf' || mime === '') {
            const pages = Math.max(1, Math.ceil(block.data.length / BASE64_BYTES_PER_PDF_PAGE));
            tokens += pages * pdfPerPage;
          } else if (mime.startsWith('image/')) {
            const dims = extractImageDimensions(block.data);
            tokens +=
              dims != null
                ? Math.ceil(
                    (isClaude
                      ? estimateAnthropicImageTokens(dims.width, dims.height)
                      : estimateOpenAIImageTokens(dims.width, dims.height)) *
                      IMAGE_TOKEN_SAFETY_MARGIN,
                  )
                : 1024;
          }
          continue;
        }
        tokens += URL_DOCUMENT_FALLBACK_TOKENS;
        continue;
      }

      // Anthropic format
      if (block.source != null) {
        if (block.source.type === 'text' && typeof block.source.data === 'string') {
          tokens +=
            getTokenCount != null
              ? getTokenCount(block.source.data)
              : Math.ceil(block.source.data.length / 4);
          continue;
        }
        if (block.source.type === 'base64' && typeof block.source.data === 'string') {
          const mime = (block.source.media_type ?? '').split(';')[0];
          if (mime === 'application/pdf' || mime === '') {
            const pages = Math.max(
              1,
              Math.ceil(block.source.data.length / BASE64_BYTES_PER_PDF_PAGE),
            );
            tokens += pages * pdfPerPage;
          }
          continue;
        }
        if (block.source.type === 'url') {
          tokens += URL_DOCUMENT_FALLBACK_TOKENS;
          continue;
        }
        if (block.source.type === 'content' && Array.isArray(block.source.content)) {
          for (const inner of block.source.content) {
            const innerBlock = inner as ContentBlock | null;
            if (
              innerBlock?.type === 'image' &&
              innerBlock.source?.type === 'base64' &&
              typeof innerBlock.source.data === 'string'
            ) {
              const dims = extractImageDimensions(innerBlock.source.data);
              tokens +=
                dims != null
                  ? Math.ceil(
                      (isClaude
                        ? estimateAnthropicImageTokens(dims.width, dims.height)
                        : estimateOpenAIImageTokens(dims.width, dims.height)) *
                        IMAGE_TOKEN_SAFETY_MARGIN,
                    )
                  : 1024;
            }
          }
          continue;
        }
      }
      tokens += URL_DOCUMENT_FALLBACK_TOKENS;
    }
  }
  return tokens;
}

export function createTokenCounter(encoding: Parameters<typeof Tokenizer.getTokenCount>[1]) {
  const isClaude = encoding === 'claude';
  return function (message: BaseMessage) {
    const countTokens = (text: string) => Tokenizer.getTokenCount(text, encoding);
    const count = getTokenCountForMessage(
      message,
      countTokens,
      encoding as 'claude' | 'o200k_base',
    );
    return isClaude ? Math.ceil(count * CLAUDE_TOKEN_CORRECTION) : count;
  };
}

export function logToolError(_graph: unknown, error: unknown, toolId: string) {
  logAxiosError({
    error,
    message: `[api/server/controllers/agents/client.js #chatCompletion] Tool Error "${toolId}"`,
  });
}

const AGENT_SUFFIX_PATTERN = /____(\d+)$/;

/** Finds the primary agent ID within a set of agent IDs (no suffix or lowest suffix number) */
export function findPrimaryAgentId(agentIds: Set<string>): string | null {
  let primaryAgentId: string | null = null;
  let lowestSuffixIndex = Infinity;

  for (const agentId of agentIds) {
    const suffixMatch = agentId.match(AGENT_SUFFIX_PATTERN);
    if (!suffixMatch) {
      return agentId;
    }
    const suffixIndex = parseInt(suffixMatch[1], 10);
    if (suffixIndex < lowestSuffixIndex) {
      lowestSuffixIndex = suffixIndex;
      primaryAgentId = agentId;
    }
  }

  return primaryAgentId;
}

type ContentPart = TMessage['content'] extends (infer U)[] | undefined ? U : never;

/**
 * Creates a mapMethod for getMessagesForConversation that processes agent content.
 * - Strips agentId/groupId metadata from all content
 * - For parallel agents (addedConvo with groupId): filters each group to its primary agent
 * - For handoffs (agentId without groupId): keeps all content from all agents
 * - For multi-agent: applies agent labels to content
 *
 * The key distinction:
 * - Parallel execution (addedConvo): Parts have both agentId AND groupId
 * - Handoffs: Parts only have agentId, no groupId
 */
export function createMultiAgentMapper(primaryAgent: Agent, agentConfigs?: Map<string, Agent>) {
  const hasMultipleAgents = (primaryAgent.edges?.length ?? 0) > 0 || (agentConfigs?.size ?? 0) > 0;

  let agentNames: Record<string, string> | null = null;
  if (hasMultipleAgents) {
    agentNames = { [primaryAgent.id]: primaryAgent.name || 'Assistant' };
    if (agentConfigs) {
      for (const [agentId, agentConfig] of agentConfigs.entries()) {
        agentNames[agentId] = agentConfig.name || agentConfig.id;
      }
    }
  }

  return (message: TMessage): TMessage => {
    if (message.isCreatedByUser || !Array.isArray(message.content)) {
      return message;
    }

    const hasAgentMetadata = message.content.some(
      (part) =>
        (part as ContentPart & { agentId?: string; groupId?: number })?.agentId ||
        (part as ContentPart & { groupId?: number })?.groupId != null,
    );
    if (!hasAgentMetadata) {
      return message;
    }

    try {
      const groupAgentMap = new Map<number, Set<string>>();

      for (const part of message.content) {
        const p = part as ContentPart & { agentId?: string; groupId?: number };
        const groupId = p?.groupId;
        const agentId = p?.agentId;
        if (groupId != null && agentId) {
          if (!groupAgentMap.has(groupId)) {
            groupAgentMap.set(groupId, new Set());
          }
          groupAgentMap.get(groupId)!.add(agentId);
        }
      }

      const groupPrimaryMap = new Map<number, string>();
      for (const [groupId, agentIds] of groupAgentMap) {
        const primary = findPrimaryAgentId(agentIds);
        if (primary) {
          groupPrimaryMap.set(groupId, primary);
        }
      }

      const filteredContent: ContentPart[] = [];
      const agentIdMap: Record<number, string> = {};

      for (const part of message.content) {
        const p = part as ContentPart & { agentId?: string; groupId?: number };
        const agentId = p?.agentId;
        const groupId = p?.groupId;

        const isParallelPart = groupId != null;
        const groupPrimary = isParallelPart ? groupPrimaryMap.get(groupId) : null;
        const shouldInclude = !isParallelPart || !agentId || agentId === groupPrimary;

        if (shouldInclude) {
          const newIndex = filteredContent.length;
          const { agentId: _a, groupId: _g, ...cleanPart } = p;
          filteredContent.push(cleanPart as ContentPart);
          if (agentId && hasMultipleAgents) {
            agentIdMap[newIndex] = agentId;
          }
        }
      }

      const finalContent =
        Object.keys(agentIdMap).length > 0 && agentNames
          ? labelContentByAgent(filteredContent as MessageContentComplex[], agentIdMap, agentNames)
          : filteredContent;

      return { ...message, content: finalContent as TMessage['content'] };
    } catch (error) {
      logger.error('[AgentClient] Error processing multi-agent message:', error);
      return message;
    }
  };
}
