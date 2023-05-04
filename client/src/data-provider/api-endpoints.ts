export const user = () => {
  return `/auth/user`;
};

export const messages = (id: string) => {
  return `/api/messages/${id}`;
};

export const abortRequest = (endpoint: string) => {
  return `/api/ask/${endpoint}/abort`;
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

export const login = () => {
  return '/auth/login';
}

export const logout = () => {
  return '/auth/logout';
}

export const register = () => {
  return '/auth/register';
}

export const loginFacebook = () => {
  return '/auth/facebook';
}

export const loginGoogle = () => {
  return '/auth/google';
}

export const refreshToken = () => {
  return '/auth/refresh';
}

export const requestPasswordReset = () => {
  return '/auth/requestPasswordReset';
}

export const resetPassword = () => {
  return '/auth/resetPassword';
}