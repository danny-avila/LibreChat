export const user = () => '/api/user';

export const balance = () => '/api/balance';

export const userPlugins = () => '/api/user/plugins';

export const messages = (conversationId: string, messageId?: string) =>
  `/api/messages/${conversationId}${messageId ? `/${messageId}` : ''}`;

const keysEndpoint = '/api/keys';

export const keys = () => keysEndpoint;

export const userKeyQuery = (name: string) => `${keysEndpoint}?name=${name}`;

export const revokeUserKey = (name: string) => `${keysEndpoint}/${name}`;

export const revokeAllUserKeys = () => `${keysEndpoint}?all=true`;

export const abortRequest = (endpoint: string) => `/api/ask/${endpoint}/abort`;

export const conversationsRoot = '/api/convos';

export const conversations = (pageNumber: string) =>
  `${conversationsRoot}?pageNumber=${pageNumber}`;

export const conversationById = (id: string) => `${conversationsRoot}/${id}`;

export const genTitle = () => `${conversationsRoot}/gen_title`;

export const updateConversation = () => `${conversationsRoot}/update`;

export const deleteConversation = () => `${conversationsRoot}/clear`;

export const importConversation = () => `${conversationsRoot}/import`;

export const forkConversation = () => `${conversationsRoot}/fork`;

export const importConversationJobStatus = (jobId: string) =>
  `${conversationsRoot}/import/jobs/${jobId}`;

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

export const assistants = (id?: string, options?: Record<string, string>) => {
  let url = '/api/assistants';

  if (id) {
    url += `/${id}`;
  }

  if (options && Object.keys(options).length > 0) {
    const queryParams = new URLSearchParams(options).toString();
    url += `?${queryParams}`;
  }

  return url;
};

export const files = () => '/api/files';

export const images = () => `${files()}/images`;

export const avatar = () => `${images()}/avatar`;
