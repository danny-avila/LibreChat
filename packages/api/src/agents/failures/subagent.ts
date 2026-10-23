import { logger } from '@librechat/data-schemas';
import type { SubagentResolutionFailureHandler } from '@librechat/agents';
import {
  MCPAuthenticationRefreshError,
  MCPAuthenticationRejectedError,
  MCPTransportAuthenticationError,
} from '~/mcp/errors';
import { ReauthenticationRequiredError } from '~/mcp/oauth/tokens';
import { OboTokenResolutionError } from '~/mcp/oauth/obo';
import { OpenIDReauthRequiredError } from '~/utils/oidc';
import { getSafeErrorText } from '~/utils/errors';

/** Links of an error's `cause` chain described; deeper causes are rarely informative. */
const MAX_CAUSE_DEPTH = 4;
const MAX_CAUSE_MESSAGE_LENGTH = 300;
const SAFE_LABEL = /^[A-Za-z0-9_.:-]{1,64}$/;
const SAFE_SERVER_NAME = /^[\w .:@-]{1,128}$/;
const REAUTHENTICATION_SERVER = /^Re-authentication required for "([^"]{1,128})"/;

/** One link of an error chain, safe to log: no stack, URLs reduced to origins, bearers removed. */
export interface SafeErrorCause {
  name: string;
  code?: string | number;
  status?: number;
  message?: string;
}

/** An MCP server whose credentials the user must renew before tools that use it can load. */
export interface MCPAuthenticationFailure {
  serverName?: string;
}

function readProperty(value: object, property: string): unknown {
  try {
    return (value as Record<string, unknown>)[property];
  } catch {
    return undefined;
  }
}

function safeLabel(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_LABEL.test(value) ? value : undefined;
}

function safeStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function describeCause(error: unknown): SafeErrorCause {
  if (typeof error === 'string') {
    return { name: 'string', message: getSafeErrorText(error).slice(0, MAX_CAUSE_MESSAGE_LENGTH) };
  }
  if (error == null || typeof error !== 'object') {
    return { name: typeof error };
  }
  const code = readProperty(error, 'code');
  const status = safeStatus(readProperty(error, 'status') ?? readProperty(error, 'statusCode'));
  const message = readProperty(error, 'message');
  return {
    name: safeLabel(readProperty(error, 'name')) ?? 'UnknownError',
    ...(safeLabel(code) != null || (typeof code === 'number' && Number.isInteger(code))
      ? { code: code as string | number }
      : {}),
    ...(status != null ? { status } : {}),
    ...(typeof message === 'string' && message.length > 0
      ? { message: getSafeErrorText(message).slice(0, MAX_CAUSE_MESSAGE_LENGTH) }
      : {}),
  };
}

/** Walks `error` and its `cause` chain, bounded and cycle-safe. */
function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  while (current != null && chain.length < MAX_CAUSE_DEPTH && !chain.includes(current)) {
    chain.push(current);
    current = typeof current === 'object' ? readProperty(current, 'cause') : undefined;
  }
  return chain;
}

/** The error and its causes by name, code, status and redacted message, never a stack. */
export function describeErrorCauses(error: unknown): SafeErrorCause[] {
  return errorChain(error).map(describeCause);
}

function getServerName(error: object): string | undefined {
  const serverName = readProperty(error, 'serverName');
  if (typeof serverName === 'string' && SAFE_SERVER_NAME.test(serverName)) {
    return serverName;
  }
  const message = readProperty(error, 'message');
  const match = typeof message === 'string' ? REAUTHENTICATION_SERVER.exec(message) : null;
  return match != null && SAFE_SERVER_NAME.test(match[1]) ? match[1] : undefined;
}

function isMCPAuthenticationError(error: unknown): error is Error {
  return (
    error instanceof ReauthenticationRequiredError ||
    error instanceof MCPAuthenticationRejectedError ||
    error instanceof MCPAuthenticationRefreshError ||
    error instanceof MCPTransportAuthenticationError ||
    error instanceof OboTokenResolutionError ||
    error instanceof OpenIDReauthRequiredError
  );
}

/**
 * The MCP server whose sign-in failed anywhere in `error`'s cause chain, or undefined when the
 * failure is not an MCP authentication failure. Generic HTTP 401/403 errors do not count: a
 * model provider rejecting its key is not an MCP server asking the user to sign in again.
 */
export function findMCPAuthenticationFailure(error: unknown): MCPAuthenticationFailure | undefined {
  for (const link of errorChain(error)) {
    if (isMCPAuthenticationError(link)) {
      const serverName = getServerName(link);
      return serverName == null ? {} : { serverName };
    }
  }
  return undefined;
}

/**
 * Logs why a subagent could not start, which the SDK otherwise reports only as a fixed
 * `cause`. Leaves the SDK's classification unchanged: its causes cannot yet say that an MCP
 * server needs re-authentication, so that reason is logged rather than shown.
 */
export const reportSubagentResolutionFailure: SubagentResolutionFailureHandler = (
  detail,
  error,
) => {
  const mcpAuthentication = findMCPAuthenticationFailure(error);
  logger.warn(
    mcpAuthentication == null
      ? '[subagents] Subagent could not start'
      : '[subagents] Subagent could not start: an MCP server it uses needs re-authentication',
    {
      phase: detail.phase,
      subagentType: detail.subagentType,
      cause: detail.cause,
      errorType: detail.type,
      aborted: detail.aborted,
      ...(detail.taskId != null ? { taskId: detail.taskId } : {}),
      ...(detail.childRunId != null ? { childRunId: detail.childRunId } : {}),
      ...(detail.parentRunId != null ? { parentRunId: detail.parentRunId } : {}),
      ...(mcpAuthentication != null ? { mcpAuthentication } : {}),
      causes: describeErrorCauses(error),
    },
  );
};
