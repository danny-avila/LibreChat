export const user = () => '/api/user';

export const balance = () => '/api/balance';
export const userById = (id: string) => {
  return `/api/user/${id}`;
};

export const userPlugins = () => '/api/user/plugins';

export const messages = (conversationId: string, messageId?: string) =>
  `/api/messages/${conversationId}${messageId ? `/${messageId}` : ''}`;

const keysEndpoint = '/api/keys';

export const keys = () => keysEndpoint;

export const userKeyQuery = (name: string) => `${keysEndpoint}?name=${name}`;

export const revokeUserKey = (name: string) => `${keysEndpoint}/${name}`;

export const revokeAllUserKeys = () => `${keysEndpoint}?all=true`;

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

export const endpointsConfigOverride = () => '/api/endpoints/config/override';

export const models = () => '/api/models';

export const tokenizer = () => '/api/tokenizer';

export const login = () => '/api/auth/login';

export const logout = () => '/api/auth/logout';

export const register = () => '/api/auth/register';

export const loginFacebook = () => '/api/auth/facebook';

export const loginGoogle = () => '/api/auth/google';

export const refreshToken = (retry?: boolean) => `/api/auth/refresh${retry ? '?retry=true' : ''}`;

export const requestPasswordReset = () => '/api/auth/requestPasswordReset';

export const resetPassword = () => '/api/auth/resetPassword';

export const plugins = () => '/api/plugins';

export const config = () => '/api/config';

export const recommendations = (type: string) => {
  return `/api/convos/${type}`;
};

export const duplicateConversation = () => {
  return '/api/convos/duplicate';
};

export const leaderboard = () => {
  return '/api/leaderboard';
};

export const likedConversations = (userId: string) => {
  return `/api/convos/likedConvos/${userId}`;
};

export const publicConversations = (userId: string) => {
  return `/api/convos/publicConvos/${userId}`;
};

export const followUser = () => {
  return '/api/user/follow';
};

export const likeConversation = () => {
  return '/api/convos/like';
};

export const assistants = (id?: string) => `/api/assistants${id ? `/${id}` : ''}`;

export const files = () => '/api/files';

export const images = () => `${files()}/images`;
