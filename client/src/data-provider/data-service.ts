import * as t from './types';
import request from './request';
import * as endpoints from './api-endpoints';

export function getConversations(pageNumber: string): Promise<t.TGetConversationsResponse> {
  return request.get(endpoints.conversations(pageNumber));
}

export function deleteConversation(payload: t.TDeleteConversationRequest) {
  //todo: this should be a DELETE request
  return request.post(endpoints.deleteConversation(), {arg: payload});
}

export function clearAllConversations(): Promise<unknown> {
  return request.post(endpoints.deleteConversation(), {arg: {}});
}

export function getMessagesByConvoId(id: string): Promise<t.TMessage[]> {
  return request.get(endpoints.messages(id));
}

export function getConversationById(id: string): Promise<t.TConversation> {
  return request.get(endpoints.conversationById(id));
}

export function updateConversation(
  payload: t.TUpdateConversationRequest
): Promise<t.TUpdateConversationResponse> {
  return request.post(endpoints.updateConversation(), {arg: payload});
}

export function getPresets(): Promise<t.TPreset[]> {
  return request.get(endpoints.presets());
}

export function createPreset(payload: t.TPreset): Promise<t.TPreset[]> {
  return request.post(endpoints.presets(), payload);
}

export function updatePreset(payload: t.TPreset): Promise<t.TPreset[]> {
  return request.post(endpoints.presets(), payload);
}

export function deletePresets(): Promise<unknown> {
  return request.post(endpoints.deletePresets(), {arg: {}});
}

export function getSearchEnabled(): Promise<boolean> {
  return request.get(endpoints.searchEnabled());
}

export function getSearchResults(q: string, pageNumber: string): Promise<t.TSearchResults> {
  return request.get(endpoints.search(q, pageNumber));
}

export function getUser(): Promise<t.TUser> {
  return request.get(endpoints.user());
}

type TSearchFetcherProps = {
  pre: () => void,
  q: string,
  pageNumber: string,
  callback: (data: any) => void
};

export const searchConversations = async({ q, pageNumber, callback }: TSearchFetcherProps) => {
  return request.get(endpoints.search(q, pageNumber)).then(({ data }) => {
    callback(data);
  });
}

export const searchFetcher = async ({ pre, q, pageNumber, callback }: TSearchFetcherProps) => {
  pre();
  //@ts-ignore
  const { data } = await request.get(endpoints.search(q, pageNumber));
  console.log('search data', data);
  callback(data);
};

export const getAIEndpoints = () => {
  return request.get(endpoints.aiEndpoints());
}