export type FileUploadResponse = {
  message: string;
  file_id: string;
  temp_file_id: string;
  filepath: string;
  filename: string;
  type: string;
  size: number;
  height: number;
  width: number;
};

export type AvatarUploadResponse = {
  url: string;
};

export type FileUploadBody = {
  formData: FormData;
  file_id: string;
};

export type UploadMutationOptions = {
  onSuccess?: (data: FileUploadResponse, variables: FileUploadBody, context?: unknown) => void;
  onMutate?: (variables: FileUploadBody) => void | Promise<unknown>;
  onError?: (error: unknown, variables: FileUploadBody, context?: unknown) => void;
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
};

export type DeleteFilesBody = {
  files: BatchFile[];
};

export type DeleteMutationOptions = {
  onSuccess?: (data: DeleteFilesResponse, variables: DeleteFilesBody, context?: unknown) => void;
  onMutate?: (variables: DeleteFilesBody) => void | Promise<unknown>;
  onError?: (error: unknown, variables: DeleteFilesBody, context?: unknown) => void;
};
