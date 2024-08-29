import type { AssistantsEndpoint } from './schemas';

export const health = () => '/health';
export const user = () => '/api/user';

export const balance = () => '/api/balance';

export const userPlugins = () => '/api/user/plugins';

export const deleteUser = () => '/api/user/delete';

export const deleteUserByEmail = () => '/api/user/deleteByEmail';

export const getUsers = (pageNumber: number, pageSize: number, searchKey: string) =>
  `/api/user/list?pageNumber=${pageNumber}&pageSize=${pageSize}&searchKey=${searchKey}`;

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

export const conversations = (pageNumber: string, isArchived?: boolean, tags?: string[]) =>
  `${conversationsRoot}?pageNumber=${pageNumber}${isArchived ? '&isArchived=true' : ''}${tags
    ?.map((tag) => `&tags=${tag}`)
    .join('')}`;

export const conversationById = (id: string) => `${conversationsRoot}/${id}`;

export const genTitle = () => `${conversationsRoot}/gen_title`;

export const updateConversation = () => `${conversationsRoot}/update`;

export const deleteConversation = () => `${conversationsRoot}/clear`;

export const importConversation = () => `${conversationsRoot}/import`;

export const forkConversation = () => `${conversationsRoot}/fork`;

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

export const prompts = () => '/api/prompts';

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

export const speech = () => `${files()}/speech`;

export const speechToText = () => `${speech()}/stt`;

export const textToSpeech = () => `${speech()}/tts`;

export const textToSpeechManual = () => `${textToSpeech()}/manual`;

export const textToSpeechVoices = () => `${textToSpeech()}/voices`;

export const getCustomConfigSpeech = () => `${speech()}/config/get`;

export const getPromptGroup = (_id: string) => `${prompts()}/groups/${_id}`;

export const getPromptGroupsWithFilters = (filter: object) => {
  let url = `${prompts()}/groups`;
  if (Object.keys(filter).length > 0) {
    const queryParams = new URLSearchParams(filter as Record<string, string>).toString();
    url += `?${queryParams}`;
  }
  return url;
};

export const getPromptsWithFilters = (filter: object) => {
  let url = prompts();
  if (Object.keys(filter).length > 0) {
    const queryParams = new URLSearchParams(filter as Record<string, string>).toString();
    url += `?${queryParams}`;
  }
  return url;
};

export const getPrompt = (_id: string) => `${prompts()}/${_id}`;

export const getRandomPrompts = (limit: number, skip: number) =>
  `${prompts()}/random?limit=${limit}&skip=${skip}`;

export const postPrompt = prompts;

export const updatePromptGroup = getPromptGroup;

export const updatePromptLabels = (_id: string) => `${getPrompt(_id)}/labels`;

export const updatePromptTag = (_id: string) => `${getPrompt(_id)}/tags/production`;

export const deletePromptGroup = getPromptGroup;

export const deletePrompt = ({ _id, groupId }: { _id: string; groupId: string }) => {
  return `${prompts()}/${_id}?groupId=${groupId}`;
};

export const getCategories = () => '/api/categories';

export const getAllPromptGroups = () => `${prompts()}/all`;

/* Roles */
export const roles = () => '/api/roles';
export const getRole = (roleName: string) => `${roles()}/${roleName.toLowerCase()}`;
export const updatePromptPermissions = (roleName: string) =>
  `${roles()}/${roleName.toLowerCase()}/prompts`;

/* Conversation Tags */
export const conversationTags = (tag?: string) => `/api/tags${tag ? `/${tag}` : ''}`;

export const conversationTagsList = (pageNumber: string, sort?: string, order?: string) =>
  `${conversationTags()}/list?pageNumber=${pageNumber}${sort ? `&sort=${sort}` : ''}${
    order ? `&order=${order}` : ''
  }`;

export const addTagToConversation = (conversationId: string) =>
  `${conversationTags()}/convo/${conversationId}`;
