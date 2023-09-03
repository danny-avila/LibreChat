export const user = () => '/api/user';

export const userPlugins = () => '/api/user/plugins';

export const messages = (conversationId: string, messageId?: string) =>
  `/api/messages/${conversationId}${messageId ? `/${messageId}` : ''}`;

export const keys = () => '/api/keys';

export const userKeyQuery = (name: string) => `${keys()}?name=${name}`;

export const abortRequest = (endpoint: string) => `/api/ask/${endpoint}/abort`;

export const conversations = (pageNumber: string) => `/api/convos?pageNumber=${pageNumber}`;

export const conversationById = (id: string) => `/api/convos/${id}`;

export const updateConversation = () => '/api/convos/update';

export const deleteConversation = () => '/api/convos/clear';

export const search = (q: string, pageNumber: string) =>
  `/api/search?q=${q}&pageNumber=${pageNumber}`;

export const searchEnabled = () => '/api/search/enable';

export const presets = () => '/api/presets';

export const deletePreset = () => '/api/presets/delete';

export const aiEndpoints = () => '/api/endpoints';

export const tokenizer = () => '/api/tokenizer';

export const login = () => '/api/auth/login';

export const logout = () => '/api/auth/logout';

export const register = () => '/api/auth/register';

export const loginFacebook = () => '/api/auth/facebook';

export const loginGoogle = () => '/api/auth/google';

export const refreshToken = () => '/api/auth/refresh';

export const requestPasswordReset = () => '/api/auth/requestPasswordReset';

export const resetPassword = () => '/api/auth/resetPassword';

export const plugins = () => '/api/plugins';

export const config = () => '/api/config';
