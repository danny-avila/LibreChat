export interface TUserProject {
  _id: string;
  projectId: string;
  user: string;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  fileIds?: string[];
  memory?: TProjectMemoryEntry[];
  defaultModel?: string;
  defaultEndpoint?: string;
  conversationCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TProjectMemoryEntry {
  key: string;
  value: string;
}

export interface UserProjectCreateParams {
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  defaultModel?: string;
  defaultEndpoint?: string;
}

export interface UserProjectUpdateParams {
  name?: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  fileIds?: string[];
  memory?: TProjectMemoryEntry[];
  defaultModel?: string;
  defaultEndpoint?: string;
}

export interface UserProjectListParams {
  cursor?: string;
  limit?: number;
  search?: string;
}

export interface UserProjectListResponse {
  projects: TUserProject[];
  nextCursor: string | null;
}

export interface UserProjectConversationsParams {
  projectId: string;
  cursor?: string;
  limit?: number;
}
