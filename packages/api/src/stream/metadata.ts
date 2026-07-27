import type { JobMetadataPatch } from './interfaces/IJobStore';
import type { GenerationJobMetadata } from '~/types';

export function sanitizeJobMetadata(metadata: Partial<GenerationJobMetadata>): JobMetadataPatch {
  const patch: JobMetadataPatch = {};
  if (metadata.responseMessageId) {
    patch.responseMessageId = metadata.responseMessageId;
  }
  if (metadata.sender) {
    patch.sender = metadata.sender;
  }
  if (metadata.conversationId) {
    patch.conversationId = metadata.conversationId;
  }
  if (metadata.userMessage) {
    patch.userMessage = metadata.userMessage;
  }
  if (metadata.endpoint) {
    patch.endpoint = metadata.endpoint;
  }
  if (metadata.iconURL) {
    patch.iconURL = metadata.iconURL;
  }
  if (metadata.model) {
    patch.model = metadata.model;
  }
  if (metadata.agent_id) {
    patch.agent_id = metadata.agent_id;
  }
  if (metadata.isTemporary !== undefined) {
    patch.isTemporary = metadata.isTemporary;
  }
  if (metadata.promptTokens !== undefined) {
    patch.promptTokens = metadata.promptTokens;
  }
  if (metadata.discoveredTools) {
    patch.discoveredTools = metadata.discoveredTools;
  }
  return patch;
}
