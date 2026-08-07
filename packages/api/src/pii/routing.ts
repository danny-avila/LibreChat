import type { Request, Response } from 'express';
import { getReferencedQuotes } from '../utils/quotes';
import { getPiiRoutingDecision } from './context';

export type PiiRouteAgent = {
  endpoint?: string | null;
  agent_ids?: unknown[];
  subagentAgentConfigs?: unknown[];
  toolDefinitions?: unknown[];
  tools?: unknown[];
  attachments?: unknown[];
  requestAttachments?: unknown[];
  agentContextAttachments?: unknown[];
  memoryToolsRegistered?: boolean;
  skillCount?: number;
  manualSkillPrimes?: unknown[];
  alwaysApplySkillPrimes?: unknown[];
  model_parameters?: Record<string, unknown>;
};

type RoutingInput = {
  req: Request;
  res: Response;
  primaryConfig: PiiRouteAgent;
  connectedAgentCount: number;
};

const hasItems = (value: unknown[] | undefined): boolean => (value?.length ?? 0) > 0;

export const applyPiiSendAsIsRoute = ({
  req,
  res,
  primaryConfig,
  connectedAgentCount,
}: RoutingInput): void => {
  if (getPiiRoutingDecision(res)?.action !== 'send_as_is') {
    return;
  }

  const body = req.body ?? {};
  const isContinuation =
    req.path === '/resume' ||
    req.route?.path === '/resume' ||
    body.isRegenerate === true ||
    body.isContinued === true ||
    body.editedContent != null ||
    body.recoverySteerId != null;
  const hasProviderBoundQuotes = getReferencedQuotes(body.quotes) != null;
  const unsupported =
    isContinuation ||
    hasProviderBoundQuotes ||
    connectedAgentCount > 0 ||
    hasItems(primaryConfig.agent_ids) ||
    hasItems(primaryConfig.subagentAgentConfigs) ||
    hasItems(primaryConfig.toolDefinitions) ||
    hasItems(primaryConfig.tools) ||
    hasItems(primaryConfig.attachments) ||
    hasItems(primaryConfig.requestAttachments) ||
    hasItems(primaryConfig.agentContextAttachments) ||
    primaryConfig.memoryToolsRegistered === true ||
    (primaryConfig.skillCount ?? 0) > 0 ||
    hasItems(primaryConfig.manualSkillPrimes) ||
    hasItems(primaryConfig.alwaysApplySkillPrimes);

  if (unsupported) {
    throw new Error(
      'PII send-as-is is unavailable for continuation, quote, tool, agent, skill, memory, or file paths',
    );
  }

  const baseURL = process.env.PII_SEND_AS_IS_BASE_URL?.trim();
  const apiKey = process.env.PII_SEND_AS_IS_API_KEY?.trim();
  const allowedEndpoint = process.env.PII_SEND_AS_IS_ENDPOINT?.trim();
  if (!baseURL || !apiKey || !allowedEndpoint || primaryConfig.endpoint !== allowedEndpoint) {
    throw new Error('PII send-as-is routing is unavailable');
  }

  const modelParameters = primaryConfig.model_parameters;
  if (modelParameters == null) {
    throw new Error('PII send-as-is routing is unavailable');
  }
  const configuration = modelParameters.configuration;
  modelParameters.apiKey = apiKey;
  modelParameters.configuration = {
    ...(configuration != null && typeof configuration === 'object' ? configuration : {}),
    baseURL,
  };
};
