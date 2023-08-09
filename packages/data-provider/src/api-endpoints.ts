export const user = () => {
  return '/api/user';
};

export const userPlugins = () => {
  return '/api/user/plugins';
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
  return '/api/convos/update';
};

export const deleteConversation = () => {
  return '/api/convos/clear';
};

export const search = (q: string, pageNumber: string) => {
  return `/api/search?q=${q}&pageNumber=${pageNumber}`;
};

export const searchEnabled = () => {
  return '/api/search/enable';
};

export const presets = () => {
  return '/api/presets';
};

export const deletePreset = () => {
  return '/api/presets/delete';
};

export const aiEndpoints = () => {
  return '/api/endpoints';
};

export const tokenizer = () => {
  return '/api/tokenizer';
};

export const login = () => {
  return '/api/auth/login';
};

export const logout = () => {
  return '/api/auth/logout';
};

export const register = () => {
  return '/api/auth/register';
};

export const loginFacebook = () => {
  return '/api/auth/facebook';
};

export const loginGoogle = () => {
  return '/api/auth/google';
};

export const refreshToken = () => {
  return '/api/auth/refresh';
};

export const requestPasswordReset = () => {
  return '/api/auth/requestPasswordReset';
};

export const resetPassword = () => {
  return '/api/auth/resetPassword';
};

export const plugins = () => {
  return '/api/plugins';
};

export const config = () => {
  return '/api/config';
}

export const recentConversations = () => {
  return '/api/convos/recent';
}

export const hottestConversations = () => {
  return '/api/convos/hottest';
}

export const duplicateConversation = () => {
  return '/api/convos/duplicate';
}

export const leaderboard = () => {
  return '/api/leaderboard';
}
