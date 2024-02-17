import { TPreset, TDeleteConversationResponse, TDeleteConversationRequest } from '../types';
import {
  Assistant,
  AssistantCreateParams,
  AssistantUpdateParams,
  ActionMetadata,
  FunctionTool,
  AssistantDocument,
  Action,
} from './assistants';

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

export type UpdatePresetOptions = {
  onSuccess?: (data: TPreset, variables: TPreset, context?: unknown) => void;
  onMutate?: (variables: TPreset) => void | Promise<unknown>;
  onError?: (error: unknown, variables: TPreset, context?: unknown) => void;
};

export type DeletePresetOptions = {
  onSuccess?: (
    data: PresetDeleteResponse,
    variables: TPreset | undefined,
    context?: unknown,
  ) => void;
  onMutate?: (variables: TPreset | undefined) => void | Promise<unknown>;
  onError?: (error: unknown, variables: TPreset | undefined, context?: unknown) => void;
};

export type LogoutOptions = {
  onSuccess?: (data: unknown, variables: undefined, context?: unknown) => void;
  onMutate?: (variables: undefined) => void | Promise<unknown>;
  onError?: (error: unknown, variables: undefined, context?: unknown) => void;
};

export type AssistantAvatarVariables = {
  assistant_id: string;
  formData: FormData;
  postCreation?: boolean;
};

export type UpdateActionVariables = {
  assistant_id: string;
  functions: FunctionTool[];
  metadata: ActionMetadata;
  action_id?: string;
};

export type UploadAssistantAvatarOptions = {
  onSuccess?: (data: Assistant, variables: AssistantAvatarVariables, context?: unknown) => void;
  onMutate?: (variables: AssistantAvatarVariables) => void | Promise<unknown>;
  onError?: (error: unknown, variables: AssistantAvatarVariables, context?: unknown) => void;
};

export type CreateAssistantMutationOptions = {
  onSuccess?: (data: Assistant, variables: AssistantCreateParams, context?: unknown) => void;
  onMutate?: (variables: AssistantCreateParams) => void | Promise<unknown>;
  onError?: (error: unknown, variables: AssistantCreateParams, context?: unknown) => void;
};

export type UpdateAssistantMutationOptions = {
  onSuccess?: (
    data: Assistant,
    variables: { assistant_id: string; data: AssistantUpdateParams },
    context?: unknown,
  ) => void;
  onMutate?: (variables: {
    assistant_id: string;
    data: AssistantUpdateParams;
  }) => void | Promise<unknown>;
  onError?: (
    error: unknown,
    variables: { assistant_id: string; data: AssistantUpdateParams },
    context?: unknown,
  ) => void;
};

export type DeleteAssistantMutationOptions = {
  onSuccess?: (data: void, variables: { assistant_id: string }, context?: unknown) => void;
  onMutate?: (variables: { assistant_id: string }) => void | Promise<unknown>;
  onError?: (error: unknown, variables: { assistant_id: string }, context?: unknown) => void;
};

export type UpdateActionResponse = [AssistantDocument, Assistant, Action];
export type UpdateActionOptions = {
  onSuccess?: (
    data: UpdateActionResponse,
    variables: UpdateActionVariables,
    context?: unknown,
  ) => void;
  onMutate?: (variables: UpdateActionVariables) => void | Promise<unknown>;
  onError?: (error: unknown, variables: UpdateActionVariables, context?: unknown) => void;
};

export type DeleteActionVariables = {
  assistant_id: string;
  action_id: string;
};

export type DeleteActionOptions = {
  onSuccess?: (data: void, variables: DeleteActionVariables, context?: unknown) => void;
  onMutate?: (variables: DeleteActionVariables) => void | Promise<unknown>;
  onError?: (error: unknown, variables: DeleteActionVariables, context?: unknown) => void;
};

export type DeleteConversationOptions = {
  onSuccess?: (
    data: TDeleteConversationResponse,
    variables: TDeleteConversationRequest,
    context?: unknown,
  ) => void;
  onMutate?: (variables: TDeleteConversationRequest) => void | Promise<unknown>;
  onError?: (error: unknown, variables: TDeleteConversationRequest, context?: unknown) => void;
};
