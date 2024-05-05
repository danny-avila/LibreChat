import type * as types from '../types';
import {
  Assistant,
  AssistantCreateParams,
  AssistantUpdateParams,
  ActionMetadata,
  FunctionTool,
  AssistantDocument,
  Action,
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

export type AssistantAvatarVariables = {
  assistant_id: string;
  model: string;
  formData: FormData;
  postCreation?: boolean;
};

export type UpdateActionVariables = {
  assistant_id: string;
  functions: FunctionTool[];
  metadata: ActionMetadata;
  action_id?: string;
  model: string;
};

export type UploadAssistantAvatarOptions = MutationOptions<Assistant, AssistantAvatarVariables>;

export type CreateAssistantMutationOptions = MutationOptions<Assistant, AssistantCreateParams>;

export type UpdateAssistantVariables = {
  assistant_id: string;
  data: AssistantUpdateParams;
};

export type UpdateAssistantMutationOptions = MutationOptions<Assistant, UpdateAssistantVariables>;

export type DeleteAssistantBody = { assistant_id: string; model: string };

export type DeleteAssistantMutationOptions = MutationOptions<
  void,
  Pick<DeleteAssistantBody, 'assistant_id'>
>;

export type UpdateActionResponse = [AssistantDocument, Assistant, Action];
export type UpdateActionOptions = MutationOptions<UpdateActionResponse, UpdateActionVariables>;

export type DeleteActionVariables = {
  assistant_id: string;
  action_id: string;
  model: string;
};

export type DeleteActionOptions = MutationOptions<void, DeleteActionVariables>;

export type DeleteConversationOptions = MutationOptions<
  types.TDeleteConversationResponse,
  types.TDeleteConversationRequest
>;

export type ForkConvoOptions = MutationOptions<types.TForkConvoResponse, types.TForkConvoRequest>;
