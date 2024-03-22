export enum FileSources {
  local = 'local',
  firebase = 'firebase',
  openai = 'openai',
  s3 = 's3',
  vectordb = 'vectordb',
}

export enum FileContext {
  avatar = 'avatar',
  unknown = 'unknown',
  assistants = 'assistants',
  image_generation = 'image_generation',
  assistants_output = 'assistants_output',
  message_attachment = 'message_attachment',
  filename = 'filename',
  updatedAt = 'updatedAt',
  source = 'source',
  context = 'context',
  bytes = 'bytes',
}

export type EndpointFileConfig = {
  disabled?: boolean;
  fileLimit?: number;
  fileSizeLimit?: number;
  totalSizeLimit?: number;
  supportedMimeTypes?: RegExp[];
};

export type FileConfig = {
  endpoints: {
    [key: string]: EndpointFileConfig;
  };
  serverFileSizeLimit?: number;
  avatarSizeLimit?: number;
  checkType?: (fileType: string, supportedTypes: RegExp[]) => boolean;
};

export type TFile = {
  _id?: string;
  __v?: number;
  user: string;
  conversationId?: string;
  message?: string;
  file_id: string;
  temp_file_id?: string;
  bytes: number;
  embedded: boolean;
  filename: string;
  filepath: string;
  object: 'file';
  type: string;
  usage: number;
  context?: FileContext;
  source?: FileSources;
  width?: number;
  height?: number;
  expiresAt?: string | Date;
  preview?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type TFileUpload = TFile & {
  temp_file_id: string;
};

export type AvatarUploadResponse = {
  url: string;
};

export type UploadMutationOptions = {
  onSuccess?: (data: TFileUpload, variables: FormData, context?: unknown) => void;
  onMutate?: (variables: FormData) => void | Promise<unknown>;
  onError?: (error: unknown, variables: FormData, context?: unknown) => void;
};

export type UploadAvatarOptions = {
  onSuccess?: (data: AvatarUploadResponse, variables: FormData, context?: unknown) => void;
  onMutate?: (variables: FormData) => void | Promise<unknown>;
  onError?: (error: unknown, variables: FormData, context?: unknown) => void;
};

export type DeleteFilesResponse = {
  message: string;
  result: Record<string, unknown>;
};

export type BatchFile = {
  file_id: string;
  filepath: string;
  embedded: boolean;
  source: FileSources;
};

export type DeleteFilesBody = {
  files: BatchFile[];
  assistant_id?: string;
};

export type DeleteMutationOptions = {
  onSuccess?: (data: DeleteFilesResponse, variables: DeleteFilesBody, context?: unknown) => void;
  onMutate?: (variables: DeleteFilesBody) => void | Promise<unknown>;
  onError?: (error: unknown, variables: DeleteFilesBody, context?: unknown) => void;
};
