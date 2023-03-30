export const openAiModels = () => {
  return `/api/open-ai-models`;
};

export const getModels = () => {
  return `/api/models`;
};

export const getAICompletion = () => {
  return `/api/ask `;
};

export const user = () => {
  return `/api/me`;
};

export const getMessages = (id: string) => {
  return `/api/messages/${id}`;
};

export const getConversations = (pageNumber: string) => {
  return `/api/convos?pageNumber=${pageNumber}`;
};

export const getConversationById = (id: string) => {
  return `/api/convos/${id}`;
};

export const updateConversation = () => {
  return `/api/convos/update`;
};

export const deleteConversation = () => {
  return `/api/convos/clear`;
};

export const prompts = () => {
  return `/api/prompts`;
};

export const customGpts = () => {
  return `/api/customGpts`;
};

// TODO: turn this into a DELETE instead of POST on the backend
export const deleteCustomGpt = () => {
  return `/api/customGpts/delete`;
};

export const generateTitle = () => {
  return `/api/convos/gen_title`;
};

export const search = (q: string, pageNumber: string) => {
  return `/api/search?q=${q}&pageNumber=${pageNumber}`;
}
