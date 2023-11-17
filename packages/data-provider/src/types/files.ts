export type FileUploadResponse = {
  message: string;
};

export type UploadMutationOptions = {
  onSuccess?: (data: FileUploadResponse, variables: FormData, context?: unknown) => void;
  onMutate?: (variables: FormData) => void | Promise<unknown>;
  onError?: (error: unknown, variables: FormData, context?: unknown) => void;
};
