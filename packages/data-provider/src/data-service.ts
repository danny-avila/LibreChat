import * as f from './types/files';
import * as q from './types/queries';
import * as m from './types/mutations';
import * as a from './types/assistants';
import * as t from './types';
import * as s from './schemas';
import request from './request';
import * as endpoints from './api-endpoints';
import type { AxiosResponse } from 'axios';

export function abortRequestWithMessage(
  endpoint: string,
  abortKey: string,
  message: string,
): Promise<void> {
  return request.post(endpoints.abortRequest(endpoint), { arg: { abortKey, message } });
}

export function revokeUserKey(name: string): Promise<unknown> {
  return request.delete(endpoints.revokeUserKey(name));
}

export function revokeAllUserKeys(): Promise<unknown> {
  return request.delete(endpoints.revokeAllUserKeys());
}

export function getMessagesByConvoId(conversationId: string): Promise<s.TMessage[]> {
  if (conversationId === 'new') {
    return Promise.resolve([]);
  }
  return request.get(endpoints.messages(conversationId));
}

export function updateMessage(payload: t.TUpdateMessageRequest): Promise<unknown> {
  const { conversationId, messageId, text } = payload;
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  return request.put(endpoints.messages(conversationId, messageId), { text });
}

export function updateUserKey(payload: t.TUpdateUserKeyRequest) {
  const { value } = payload;
  if (!value) {
    throw new Error('value is required');
  }

  return request.put(endpoints.keys(), payload);
}

export function getPresets(): Promise<s.TPreset[]> {
  return request.get(endpoints.presets());
}

export function createPreset(payload: s.TPreset): Promise<s.TPreset> {
  return request.post(endpoints.presets(), payload);
}

export function updatePreset(payload: s.TPreset): Promise<s.TPreset> {
  return request.post(endpoints.presets(), payload);
}

export function deletePreset(arg: s.TPreset | undefined): Promise<m.PresetDeleteResponse> {
  return request.post(endpoints.deletePreset(), arg);
}

export function getSearchEnabled(): Promise<boolean> {
  return request.get(endpoints.searchEnabled());
}

export function getUser(): Promise<t.TUser> {
  return request.get(endpoints.user());
}

export function getUserBalance(): Promise<string> {
  return request.get(endpoints.balance());
}

export const updateTokenCount = (text: string) => {
  return request.post(endpoints.tokenizer(), { arg: text });
};

export const login = (payload: t.TLoginUser) => {
  return request.post(endpoints.login(), payload);
};

export const logout = () => {
  return request.post(endpoints.logout());
};

export const register = (payload: t.TRegisterUser) => {
  return request.post(endpoints.register(), payload);
};

export const userKeyQuery = (name: string): Promise<t.TCheckUserKeyResponse> =>
  request.get(endpoints.userKeyQuery(name));

export const getLoginGoogle = () => {
  return request.get(endpoints.loginGoogle());
};

export const requestPasswordReset = (
  payload: t.TRequestPasswordReset,
): Promise<t.TRequestPasswordResetResponse> => {
  return request.post(endpoints.requestPasswordReset(), payload);
};

export const resetPassword = (payload: t.TResetPassword) => {
  return request.post(endpoints.resetPassword(), payload);
};

export const getAvailablePlugins = (): Promise<s.TPlugin[]> => {
  return request.get(endpoints.plugins());
};

export const updateUserPlugins = (payload: t.TUpdateUserPlugins) => {
  return request.post(endpoints.userPlugins(), payload);
};

/* Config */

export const getStartupConfig = (): Promise<t.TStartupConfig> => {
  return request.get(endpoints.config());
};

export const getAIEndpoints = (): Promise<t.TEndpointsConfig> => {
  return request.get(endpoints.aiEndpoints());
};

export const getModels = async (): Promise<t.TModelsConfig> => {
  return request.get(endpoints.models());
};

export const getEndpointsConfigOverride = (): Promise<unknown | boolean> => {
  return request.get(endpoints.endpointsConfigOverride());
};

/* Assistants */

export const createAssistant = (data: a.AssistantCreateParams): Promise<a.Assistant> => {
  return request.post(endpoints.assistants(), data);
};

export const getAssistantById = (assistant_id: string): Promise<a.Assistant> => {
  return request.get(endpoints.assistants(assistant_id));
};

export const updateAssistant = (
  assistant_id: string,
  data: a.AssistantUpdateParams,
): Promise<a.Assistant> => {
  return request.patch(endpoints.assistants(assistant_id), data);
};

export const deleteAssistant = (assistant_id: string, model: string): Promise<void> => {
  return request.delete(endpoints.assistants(assistant_id, { model }));
};

export const listAssistants = (
  params?: a.AssistantListParams,
): Promise<a.AssistantListResponse> => {
  return request.get(endpoints.assistants(), { params });
};

export function getAssistantDocs(): Promise<a.AssistantDocument[]> {
  return request.get(endpoints.assistants('documents'));
}

/* Tools */

export const getAvailableTools = (): Promise<s.TPlugin[]> => {
  return request.get(`${endpoints.assistants()}/tools`);
};

/* Files */

export const getFiles = (): Promise<f.TFile[]> => {
  return request.get(endpoints.files());
};

export const getFileConfig = (): Promise<f.FileConfig> => {
  return request.get(`${endpoints.files()}/config`);
};

export const uploadImage = (data: FormData): Promise<f.TFileUpload> => {
  return request.postMultiPart(endpoints.images(), data);
};

export const uploadFile = (data: FormData): Promise<f.TFileUpload> => {
  return request.postMultiPart(endpoints.files(), data);
};

export const uploadAvatar = (data: FormData): Promise<f.AvatarUploadResponse> => {
  return request.postMultiPart(endpoints.avatar(), data);
};

export const uploadAssistantAvatar = (data: m.AssistantAvatarVariables): Promise<a.Assistant> => {
  return request.postMultiPart(
    endpoints.assistants(`avatar/${data.assistant_id}`, { model: data.model }),
    data.formData,
  );
};

export const getFileDownload = async (userId: string, file_id: string): Promise<AxiosResponse> => {
  return request.getResponse(`${endpoints.files()}/download/${userId}/${file_id}`, {
    responseType: 'blob',
    headers: {
      Accept: 'application/octet-stream',
    },
  });
};

export const deleteFiles = async (
  files: f.BatchFile[],
  assistant_id?: string,
): Promise<f.DeleteFilesResponse> =>
  request.deleteWithOptions(endpoints.files(), {
    data: { files, assistant_id },
  });

/* actions */

export const updateAction = (data: m.UpdateActionVariables): Promise<m.UpdateActionResponse> => {
  const { assistant_id, ...body } = data;
  return request.post(endpoints.assistants(`actions/${assistant_id}`), body);
};

export function getActions(): Promise<a.Action[]> {
  return request.get(endpoints.assistants('actions'));
}

export const deleteAction = async (
  assistant_id: string,
  action_id: string,
  model: string,
): Promise<void> =>
  request.delete(endpoints.assistants(`actions/${assistant_id}/${action_id}/${model}`));

/* conversations */

export function deleteConversation(payload: t.TDeleteConversationRequest) {
  //todo: this should be a DELETE request
  return request.post(endpoints.deleteConversation(), { arg: payload });
}

export function clearAllConversations(): Promise<unknown> {
  return request.post(endpoints.deleteConversation(), { arg: {} });
}

export const listConversations = (
  params?: q.ConversationListParams,
): Promise<q.ConversationListResponse> => {
  // Assuming params has a pageNumber property
  const pageNumber = params?.pageNumber || '1'; // Default to page 1 if not provided
  return request.get(endpoints.conversations(pageNumber));
};

export const listConversationsByQuery = (
  params?: q.ConversationListParams & { searchQuery?: string },
): Promise<q.ConversationListResponse> => {
  const pageNumber = params?.pageNumber || '1'; // Default to page 1 if not provided
  const searchQuery = params?.searchQuery || ''; // If no search query is provided, default to an empty string
  // Update the endpoint to handle a search query
  if (searchQuery !== '') {
    return request.get(endpoints.search(searchQuery, pageNumber));
  } else {
    return request.get(endpoints.conversations(pageNumber));
  }
};

export const searchConversations = async (
  q: string,
  pageNumber: string,
): Promise<t.TSearchResults> => {
  return request.get(endpoints.search(q, pageNumber));
};

export function getConversations(pageNumber: string): Promise<t.TGetConversationsResponse> {
  return request.get(endpoints.conversations(pageNumber));
}

export function getConversationById(id: string): Promise<s.TConversation> {
  return request.get(endpoints.conversationById(id));
}

export function updateConversation(
  payload: t.TUpdateConversationRequest,
): Promise<t.TUpdateConversationResponse> {
  return request.post(endpoints.updateConversation(), { arg: payload });
}

export function genTitle(payload: m.TGenTitleRequest): Promise<m.TGenTitleResponse> {
  return request.post(endpoints.genTitle(), payload);
}
