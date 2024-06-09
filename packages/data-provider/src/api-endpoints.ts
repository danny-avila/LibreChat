import type { AssistantsEndpoint } from './schemas';

export const user = () => '/api/user';

export const balance = () => '/api/balance';

export const userPlugins = () => '/api/user/plugins';

export const deleteUser = () => '/api/user/delete';

export const messages = (conversationId: string, messageId?: string) =>
  `/api/messages/${conversationId}${messageId ? `/${messageId}` : ''}`;

const shareRoot = '/api/share';
export const shareMessages = (shareId: string) => `${shareRoot}/${shareId}`;
export const getSharedLinks = (pageNumber: string, isPublic: boolean) =>
  `${shareRoot}?pageNumber=${pageNumber}&isPublic=${isPublic}`;
export const createSharedLink = shareRoot;
export const updateSharedLink = shareRoot;

const keysEndpoint = '/api/keys';

export const keys = () => keysEndpoint;

export const userKeyQuery = (name: string) => `${keysEndpoint}?name=${name}`;

export const revokeUserKey = (name: string) => `${keysEndpoint}/${name}`;

export const revokeAllUserKeys = () => `${keysEndpoint}?all=true`;

export const abortRequest = (endpoint: string) => `/api/ask/${endpoint}/abort`;

export const conversationsRoot = '/api/convos';

export const conversations = (pageNumber: string, isArchived?: boolean) =>
  `${conversationsRoot}?pageNumber=${pageNumber}${isArchived ? '&isArchived=true' : ''}`;

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

export const verifyEmail = () => '/api/user/verify';

export const resendVerificationEmail = () => '/api/user/verify/resend';

export const plugins = () => '/api/plugins';

export const config = () => '/api/config';

export const assistants = ({
  path,
  options,
  version,
  endpoint,
}: {
  path?: string;
  options?: object;
  endpoint?: AssistantsEndpoint;
  version: number | string;
}) => {
  let url = `/api/assistants/v${version}`;

  if (path) {
    url += `/${path}`;
  }

  if (endpoint) {
    options = {
      ...(options ?? {}),
      endpoint,
    };
  }

  if (options && Object.keys(options).length > 0) {
    const queryParams = new URLSearchParams(options as Record<string, string>).toString();
    url += `?${queryParams}`;
  }

  return url;
};

export const files = () => '/api/files';

export const images = () => `${files()}/images`;

export const avatar = () => `${images()}/avatar`;

export const speechToText = () => `${files()}/stt`;

export const textToSpeech = () => `${files()}/tts`;

export const textToSpeechManual = () => `${textToSpeech()}/manual`;

export const textToSpeechVoices = () => `${textToSpeech()}/voices`;
