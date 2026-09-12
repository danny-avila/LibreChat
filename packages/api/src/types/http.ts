import type {
  CodeApprovalMode,
  CodeWorkspaceSelection,
  TFile,
  TEndpointOption,
} from 'librechat-data-provider';
import type { IUser, AppConfig, IConversation } from '@librechat/data-schemas';
import type { Request } from 'express';
import type { ResolvedChatProjectContext } from '../projects/context';

/**
 * LibreChat-specific request body type that extends Express Request body
 * (have to use type alias because you can't extend indexed access types like Request['body'])
 */
export type RequestBody = {
  messageId?: string;
  fileTokenLimit?: number;
  conversationId?: string;
  parentMessageId?: string;
  endpoint?: string;
  endpointType?: string;
  model?: string;
  key?: string;
  chatProjectId?: string | null;
  endpointOption?: Partial<TEndpointOption>;
  /** Browser IANA timezone used to resolve local-time prompt variables (e.g. `{{current_datetime}}`). */
  timezone?: string;
  codeApprovalMode?: CodeApprovalMode;
  codeWorkspaces?: CodeWorkspaceSelection[];
};

export type ServerRequest = Request<unknown, unknown, RequestBody> & {
  user?: IUser;
  config?: AppConfig;
  /** Server-captured generation start time used to anchor dynamic prompt variables. */
  turnStartedAt?: number;
  /** Server-captured original conversation creation timestamp. */
  conversationCreatedAt?: string;
  /** Conversation read by request middleware (`null` = looked up, absent), reused by the
   *  subagent guard, agent initialization, and the first save instead of re-reading it. */
  resolvedConversation?: Partial<IConversation> | null;
  /** Authoritative server-only project context for the current turn. */
  chatProjectContext?: ResolvedChatProjectContext | null;
  /** Metadata-only project files hydrated once per request. */
  chatProjectFiles?: TFile[];
  /** Request-scoped in-flight hydration shared by connected graph agents. */
  chatProjectFilesPromise?: Promise<TFile[]>;
  /** Internal opt-in marker for conversation graph agent initialization. */
  chatProjectContextEnabled?: boolean;
  authStrategy?: string;
};
