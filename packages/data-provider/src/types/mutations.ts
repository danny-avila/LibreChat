import * as types from '../types';
import * as r from '../roles';
import {
  Tools,
  Assistant,
  AssistantCreateParams,
  AssistantUpdateParams,
  ActionMetadata,
  FunctionTool,
  AssistantDocument,
  Action,
  Agent,
  AgentCreateParams,
  AgentUpdateParams,
} from './assistants';

export type MutationOptions<
  Response,
  Request,
  Context = unknown,
  Error = unknown,
  Snapshot = void,
> = {
  onSuccess?: (data: Response, variables: Request, context?: Context) => void;
  onMutate?: (variables: Request) => Snapshot | Promise<Snapshot>;
  onError?: (error: Error, variables: Request, context?: Context, snapshot?: Snapshot) => void;
};

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

export type UpdatePresetOptions = MutationOptions<types.TPreset, types.TPreset>;

export type DeletePresetOptions = MutationOptions<PresetDeleteResponse, types.TPreset | undefined>;

export type LogoutOptions = MutationOptions<unknown, undefined>;

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

export type UploadAssistantAvatarOptions = MutationOptions<Assistant, AssistantAvatarVariables>;

export type CreateAssistantMutationOptions = MutationOptions<Assistant, AssistantCreateParams>;

export type UpdateAssistantVariables = {
  assistant_id: string;
  data: AssistantUpdateParams;
};

export type UpdateAssistantMutationOptions = MutationOptions<Assistant, UpdateAssistantVariables>;

export type DeleteAssistantBody = {
  assistant_id: string;
  model: string;
  endpoint: types.AssistantsEndpoint;
};

export type DeleteAssistantMutationOptions = MutationOptions<
  void,
  Pick<DeleteAssistantBody, 'assistant_id'>
>;

export type UpdateActionResponse = [AssistantDocument, Assistant, Action];
export type UpdateActionOptions = MutationOptions<UpdateActionResponse, UpdateActionVariables>;

export type DeleteActionVariables = {
  endpoint: types.AssistantsEndpoint;
  assistant_id: string;
  action_id: string;
  model: string;
};

export type DeleteActionOptions = MutationOptions<void, DeleteActionVariables>;

/* Agent mutations */

export type AgentAvatarVariables = {
  agent_id: string;
  formData: FormData;
  postCreation?: boolean;
};

export type UpdateAgentActionVariables = {
  agent_id: string;
  action_id?: string;
  metadata: ActionMetadata;
  functions: FunctionTool[];
};

export type UploadAgentAvatarOptions = MutationOptions<Agent, AgentAvatarVariables>;

export type CreateAgentMutationOptions = MutationOptions<Agent, AgentCreateParams>;

export type UpdateAgentVariables = {
  agent_id: string;
  data: AgentUpdateParams;
};

export type UpdateAgentMutationOptions = MutationOptions<Agent, UpdateAgentVariables>;

export type DeleteAgentBody = {
  agent_id: string;
};

export type DeleteAgentMutationOptions = MutationOptions<void, Pick<DeleteAgentBody, 'agent_id'>>;

export type UpdateAgentActionResponse = [Agent, Action];
export type UpdateAgentActionOptions = MutationOptions<
  UpdateAgentActionResponse,
  UpdateAgentActionVariables
>;

export type DeleteAgentActionVariables = {
  agent_id: string;
  action_id: string;
};

export type DeleteAgentActionOptions = MutationOptions<void, DeleteAgentActionVariables>;

export type DeleteConversationOptions = MutationOptions<
  types.TDeleteConversationResponse,
  types.TDeleteConversationRequest
>;

export type ForkConvoOptions = MutationOptions<types.TForkConvoResponse, types.TForkConvoRequest>;

export type CreateSharedLinkOptions = MutationOptions<
  types.TSharedLink,
  Partial<types.TSharedLink>
>;

export type updateTagsInConvoOptions = MutationOptions<
  types.TTagConversationResponse,
  types.TTagConversationRequest
>;

export type UpdateSharedLinkOptions = MutationOptions<
  types.TSharedLink,
  Partial<types.TSharedLink>
>;

export type ArchiveConvoOptions = MutationOptions<
  types.TArchiveConversationResponse,
  types.TArchiveConversationRequest
>;

export type DeleteSharedLinkOptions = MutationOptions<types.TSharedLink, { shareId: string }>;

export type TUpdatePromptContext =
  | {
      group?: types.TPromptGroup;
      previousListData?: types.PromptGroupListData;
    }
  | undefined;

export type UpdatePromptGroupOptions = MutationOptions<
  types.TUpdatePromptGroupResponse,
  types.TUpdatePromptGroupVariables,
  TUpdatePromptContext
>;

export type CreatePromptOptions = MutationOptions<types.TCreatePromptResponse, types.TCreatePrompt>;

export type DeletePromptOptions = MutationOptions<
  types.TDeletePromptResponse,
  types.TDeletePromptVariables
>;

export type DeletePromptGroupOptions = MutationOptions<
  types.TDeletePromptGroupResponse,
  types.TDeletePromptGroupRequest
>;

export type UpdatePromptLabelOptions = MutationOptions<
  types.TUpdatePromptLabelsResponse,
  types.TUpdatePromptLabelsRequest
>;

export type MakePromptProductionOptions = MutationOptions<
  types.TMakePromptProductionResponse,
  types.TMakePromptProductionRequest,
  TUpdatePromptContext
>;

/* Auth mutations */
export type VerifyEmailOptions = MutationOptions<types.VerifyEmailResponse, types.TVerifyEmail>;
export type ResendVerifcationOptions = MutationOptions<
  types.VerifyEmailResponse,
  types.TResendVerificationEmail
>;
export type RegistrationOptions = MutationOptions<
  types.TRegisterUserResponse,
  types.TRegisterUser,
  unknown,
  types.TError
>;

export type UpdatePromptPermVars = {
  roleName: string;
  updates: Partial<r.TPromptPermissions>;
};

export type UpdatePromptPermResponse = r.TRole;

export type UpdatePromptPermOptions = MutationOptions<
  UpdatePromptPermResponse,
  UpdatePromptPermVars,
  unknown,
  types.TError
>;

export type UpdateConversationTagOptions = MutationOptions<
  types.TConversationTag,
  types.TConversationTagRequest
>;
export type DeleteConversationTagOptions = MutationOptions<types.TConversationTag, string>;

export type AcceptTermsMutationOptions = MutationOptions<
  types.TAcceptTermsResponse,
  void,
  unknown,
  void
>;

/* Tools */
export type UpdatePluginAuthOptions = MutationOptions<types.TUser, types.TUpdateUserPlugins>;

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
export type ToolCallMutationOptions<T extends ToolId> = MutationOptions<
  ToolCallResponse,
  ToolParams<T>
>;
