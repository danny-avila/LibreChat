import * as t from './types';
import request from './request';
import * as endpoints from './endpoints';

export function postAICompletion(payload: t.TAICompletionRequest) {
  return request.post(endpoints.getAICompletion(), payload);
}

export function getConversations(pageNumber: string): Promise<t.TGetConversationsResponse> {
  return request.get(endpoints.getConversations(pageNumber));
}

export function deleteConversation(payload: t.TDeleteConversationRequest) {
  //todo: this should be a DELETE request
  return request.post(endpoints.deleteConversation(), payload);
}

export function getMessagesByConvoId(id: string): Promise<t.TMessage[]> {
  return request.get(endpoints.getMessages(id));
}

export function getConversationById(id: string): Promise<t.TConversation> {
  return request.get(endpoints.getConversationById(id));
}

export function updateConversation(
  payload: t.TUpdateConversationRequest
): Promise<t.TUpdateConversationResponse> {
  return request.post(endpoints.updateConversation(), payload);
}

export function updateCustomGpt(payload: t.TUpdateCustomGptRequest) {
  return request.post(endpoints.customGpts(), payload);
}

export function getCustomGpts(): Promise<t.TGetCustomGptsResponse> {
  return request.get(endpoints.customGpts());
}

export function deleteCustomGpt(payload: t.TDeleteCustomGptRequest): Promise<t.TDeleteCustomGptResponse> {
  return request.post(endpoints.deleteCustomGpt(), payload);
}

export function getModels(): Promise<t.TGetModelsResponse> {
  return request.get(endpoints.getModels());
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

export const searchFetcher = async ({ pre, q, pageNumber, callback }: TSearchFetcherProps) => {
  pre();
  //@ts-ignore
  const { data } = await request.get(endpoints.search(q, pageNumber));
  console.log('search data', data);
  callback(data);
};
