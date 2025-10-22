import * as types from '../types';
import * as r from '../roles';
import * as p from '../permissions';
import type { MutationFunctionContext, UseMutationOptions, QueryKey } from '@tanstack/react-query';
import {
  Tools,
  Assistant,
  AssistantCreateParams,
  AssistantUpdateParams,
  FunctionTool,
  AssistantDocument,
  Agent,
  AgentCreateParams,
  AgentUpdateParams,
} from './assistants';
import { Action, ActionMetadata } from './agents';

// Deprecate custom MutationOptions shape and alias to React Query v5
export type MutationOptions<
  Response,
  Request,
  Context = unknown,
  Error = unknown,
  OnMutateResult = unknown,
> = UseMutationOptions<Response, Error, Request, OnMutateResult>;

export type TGenTitleRequest = {
  conversationId: string;
};

export type TGenTitleResponse = {
  title: string;
};

export type PresetDeleteResponse = {
  acknowledged: boolean;
  deletedCount: number;
};

export type UpdatePresetOptions = UseMutationOptions<types.TPreset, unknown, types.TPreset>;

export type DeletePresetOptions = UseMutationOptions<
  PresetDeleteResponse,
  unknown,
  types.TPreset | undefined
>;

/* Assistant mutations */

export type AssistantAvatarVariables = {
  assistant_id: string;
  model: string;
  formData: FormData;
  postCreation?: boolean;
  endpoint: types.AssistantsEndpoint;
  version: number | string;
};

export type UpdateActionVariables = {
  assistant_id: string;
  functions: FunctionTool[];
  metadata: ActionMetadata;
  action_id?: string;
  model: string;
  endpoint: types.AssistantsEndpoint;
  version: number | string;
};

export type UploadAssistantAvatarOptions = UseMutationOptions<
  Assistant,
  unknown,
  AssistantAvatarVariables
>;

export type CreateAssistantMutationOptions = UseMutationOptions<
  Assistant,
  Error,
  AssistantCreateParams
>;

export type UpdateAssistantVariables = {
  assistant_id: string;
  data: AssistantUpdateParams;
};

export type UpdateAssistantMutationOptions = UseMutationOptions<
  Assistant,
  Error,
  UpdateAssistantVariables
>;

export type DeleteAssistantBody = {
  assistant_id: string;
  model: string;
  endpoint: types.AssistantsEndpoint;
};

export type DeleteAssistantMutationOptions = UseMutationOptions<
  void,
  Error,
  Pick<DeleteAssistantBody, 'assistant_id'>
>;

export type UpdateActionResponse = [AssistantDocument, Assistant, Action];
export type UpdateActionOptions = UseMutationOptions<
  UpdateActionResponse,
  unknown,
  UpdateActionVariables
>;

export type DeleteActionVariables = {
  endpoint: types.AssistantsEndpoint;
  assistant_id: string;
  action_id: string;
  model: string;
};

export type DeleteActionOptions = UseMutationOptions<void, Error, DeleteActionVariables>;

/* Agent mutations */

export type AgentAvatarVariables = {
  agent_id: string;
  formData: FormData;
};

export type UpdateAgentActionVariables = {
  agent_id: string;
  action_id?: string;
  metadata: ActionMetadata;
  functions: FunctionTool[];
};

export type UploadAgentAvatarOptions = UseMutationOptions<Agent, unknown, AgentAvatarVariables>;

export type CreateAgentMutationOptions = UseMutationOptions<Agent, Error, AgentCreateParams>;

export type UpdateAgentVariables = {
  agent_id: string;
  data: AgentUpdateParams;
};

export type DuplicateVersionError = Error & {
  statusCode?: number;
  details?: {
    duplicateVersion?: unknown;
    versionIndex?: number;
  };
};

export type UpdateAgentMutationOptions = UseMutationOptions<Agent, Error, UpdateAgentVariables>;

export type DuplicateAgentBody = {
  agent_id: string;
};

export type DuplicateAgentMutationOptions = UseMutationOptions<
  { agent: Agent; actions: Action[] },
  Error,
  Pick<DuplicateAgentBody, 'agent_id'>
>;

export type DeleteAgentBody = {
  agent_id: string;
};

export type DeleteAgentMutationOptions = UseMutationOptions<
  void,
  Error,
  Pick<DeleteAgentBody, 'agent_id'>
>;

export type UpdateAgentActionResponse = [Agent, Action];
export type UpdateAgentActionOptions = UseMutationOptions<
  UpdateAgentActionResponse,
  unknown,
  UpdateAgentActionVariables
>;

export type DeleteAgentActionVariables = {
  agent_id: string;
  action_id: string;
};

export type DeleteAgentActionOptions = UseMutationOptions<void, Error, DeleteAgentActionVariables>;

export type RevertAgentVersionVariables = {
  agent_id: string;
  version_index: number;
};

export type RevertAgentVersionOptions = UseMutationOptions<
  Agent,
  Error,
  RevertAgentVersionVariables
>;

export type DeleteConversationOptions = UseMutationOptions<
  types.TDeleteConversationResponse,
  unknown,
  types.TDeleteConversationRequest
>;

export type ArchiveConversationOptions = UseMutationOptions<
  types.TArchiveConversationResponse,
  unknown,
  types.TArchiveConversationRequest
>;

export type DuplicateConvoOptions = UseMutationOptions<
  types.TDuplicateConvoResponse,
  unknown,
  types.TDuplicateConvoRequest
>;

export type ForkConvoOptions = UseMutationOptions<
  types.TForkConvoResponse,
  unknown,
  types.TForkConvoRequest
>;

export type CreateSharedLinkOptions = UseMutationOptions<
  types.TSharedLink,
  unknown,
  Partial<types.TSharedLink>
>;

export type updateTagsInConvoOptions = UseMutationOptions<
  types.TTagConversationResponse,
  unknown,
  types.TTagConversationRequest
>;

export type UpdateSharedLinkOptions = UseMutationOptions<
  types.TSharedLink,
  unknown,
  Partial<types.TSharedLink>
>;

export type ArchiveConvoOptions = UseMutationOptions<
  types.TArchiveConversationResponse,
  unknown,
  types.TArchiveConversationRequest
>;

export type DeleteSharedLinkContext = {
  previousQueries?: Map<QueryKey, unknown>;
};
export type DeleteSharedLinkOptions = UseMutationOptions<
  TDeleteSharedLinkResponse,
  unknown,
  { shareId: string },
  DeleteSharedLinkContext
>;

export type TUpdatePromptContext =
  | {
      group?: types.TPromptGroup;
      previousListData?: types.PromptGroupListData;
    }
  | undefined;

export type UpdatePromptGroupOptions = UseMutationOptions<
  types.TUpdatePromptGroupResponse,
  unknown,
  types.TUpdatePromptGroupVariables,
  TUpdatePromptContext
>;

export type CreatePromptOptions = UseMutationOptions<
  types.TCreatePromptResponse,
  unknown,
  types.TCreatePrompt
>;

export type DeletePromptOptions = UseMutationOptions<
  types.TDeletePromptResponse,
  unknown,
  types.TDeletePromptVariables
>;

export type DeletePromptGroupOptions = UseMutationOptions<
  types.TDeletePromptGroupResponse,
  unknown,
  types.TDeletePromptGroupRequest
>;

export type UpdatePromptLabelOptions = UseMutationOptions<
  types.TUpdatePromptLabelsResponse,
  unknown,
  types.TUpdatePromptLabelsRequest
>;

export type MakePromptProductionOptions = UseMutationOptions<
  types.TMakePromptProductionResponse,
  unknown,
  types.TMakePromptProductionRequest,
  TUpdatePromptContext
>;

/* Auth mutations */
export type VerifyEmailOptions = UseMutationOptions<
  types.VerifyEmailResponse,
  unknown,
  types.TVerifyEmail
>;
export type ResendVerifcationOptions = MutationOptions<
  types.VerifyEmailResponse,
  types.TResendVerificationEmail
>;
export type RegistrationOptions = UseMutationOptions<
  types.TRegisterUserResponse,
  types.TError,
  types.TRegisterUser,
  unknown
>;

export type UpdatePermVars<T> = {
  roleName: string;
  updates: Partial<T>;
};

export type UpdatePromptPermVars = UpdatePermVars<p.TPromptPermissions>;
export type UpdateMemoryPermVars = UpdatePermVars<p.TMemoryPermissions>;
export type UpdateAgentPermVars = UpdatePermVars<p.TAgentPermissions>;
export type UpdatePeoplePickerPermVars = UpdatePermVars<p.TPeoplePickerPermissions>;

export type UpdatePermResponse = r.TRole;

export type UpdatePromptPermOptions = UseMutationOptions<
  UpdatePermResponse,
  types.TError | null | undefined,
  UpdatePromptPermVars,
  unknown
>;

export type UpdateMemoryPermOptions = UseMutationOptions<
  UpdatePermResponse,
  types.TError | null | undefined,
  UpdateMemoryPermVars,
  unknown
>;

export type UpdateAgentPermOptions = UseMutationOptions<
  UpdatePermResponse,
  types.TError | null | undefined,
  UpdateAgentPermVars,
  unknown
>;

export type UpdatePeoplePickerPermOptions = UseMutationOptions<
  UpdatePermResponse,
  types.TError | null | undefined,
  UpdatePeoplePickerPermVars,
  unknown
>;

export type UpdateMarketplacePermVars = UpdatePermVars<p.TMarketplacePermissions>;

export type UpdateMarketplacePermOptions = UseMutationOptions<
  UpdatePermResponse,
  types.TError | null | undefined,
  UpdateMarketplacePermVars,
  unknown
>;

export type UpdateConversationTagOptions = UseMutationOptions<
  types.TConversationTag,
  unknown,
  types.TConversationTagRequest
>;
export type DeleteConversationTagOptions = MutationOptions<types.TConversationTag, string>;

export type AcceptTermsMutationOptions = UseMutationOptions<
  types.TAcceptTermsResponse,
  void,
  void,
  unknown
>;

/* Tools */
export type UpdatePluginAuthOptions = UseMutationOptions<
  types.TUser,
  unknown,
  types.TUpdateUserPlugins
>;

export type ToolParamsMap = {
  [Tools.execute_code]: {
    lang: string;
    code: string;
  };
};

export type ToolId = keyof ToolParamsMap;

export type ToolParams<T extends ToolId> = ToolParamsMap[T] & {
  messageId: string;
  partIndex?: number;
  blockIndex?: number;
  conversationId: string;
};
export type ToolCallResponse = { result: unknown; attachments?: types.TAttachment[] };
export type ToolCallMutationOptions<T extends ToolId> = UseMutationOptions<
  ToolCallResponse,
  Error,
  ToolParams<T>
>;

export type TDeleteSharedLinkResponse = {
  success: boolean;
  shareId: string;
  message: string;
};

export type TEditArtifactRequest = {
  index: number;
  messageId: string;
  original: string;
  updated: string;
};

export type TEditArtifactResponse = Pick<types.TMessage, 'content' | 'text' | 'conversationId'>;

export type EditArtifactOptions = UseMutationOptions<
  TEditArtifactResponse,
  Error,
  TEditArtifactRequest,
  unknown
>;

export type TLogoutResponse = {
  message: string;
  redirect?: string;
};

export type LogoutOptions = UseMutationOptions<TLogoutResponse, unknown, undefined>;

export interface AssistantInitialize {
  message: string;
  error?: string;
}

export interface CancelMCPOAuthResponse {
  success: boolean;
  message: string;
}
