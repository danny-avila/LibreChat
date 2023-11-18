export type FileUploadResponse = {
  message: string;
  temp_file_id: string;
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
