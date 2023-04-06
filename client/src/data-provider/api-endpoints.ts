export const user = () => {
  return `/api/me`;
};

export const messages = (id: string) => {
  return `/api/messages/${id}`;
};

export const conversations = (pageNumber: string) => {
  return `/api/convos?pageNumber=${pageNumber}`;
};

export const conversationById = (id: string) => {
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

export const generateTitle = () => {
  return `/api/convos/gen_title`;
};

export const search = (q: string, pageNumber: string) => {
  return `/api/search?q=${q}&pageNumber=${pageNumber}`;
}

export const searchEnabled = () => {
  return `/api/search/enable`;
}

export const presets = () => {
  return `/api/presets`;
}

export const deletePreset = () => {
  return `/api/presets/delete`;
}

export const aiEndpoints = () => {
  return `/api/endpoints`;
}

export const tokenizer = () => {
  return `/api/tokenizer`;
}
