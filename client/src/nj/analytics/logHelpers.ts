import { logEvent } from '~/nj/analytics/logEvent';
import { ErrorTypes, TMessage } from 'librechat-data-provider';
import { ExtendedFile } from '~/common';

// A place for our logging logic (to keep it separate from LibreChat files & minimize merge conflicts)

export function logCopyEvent(isCreatedByUser: boolean) {
  logEvent(isCreatedByUser ? 'copy_prompt_text' : 'copy_response_text');
}

export function logSubmitPrompt(message: TMessage, hasError: boolean) {
  const eventName = hasError ? 'submit_prompt_server_error' : 'submit_prompt_success';

  const extraParameters = {
    input_length: message.text.length,
    object_type: message.files?.map((file) => file.type) ?? '',

    // Note that files often don't have this data unless the user is resubmitting... should fix
    // this problem somehow eventually.
    object_length: message.files?.map((file) => file['text']?.length) ?? '',
    object_size: message.files?.map((file) => file.bytes) ?? '',
  };

  logEvent(eventName, extraParameters);
}

export function logIfPromptLengthError(error: object) {
  if (error['type'] !== ErrorTypes.INPUT_LENGTH) {
    return;
  }

  // Parse the input length out of the error info, if we can
  const extraParameters = {};
  const info: string = error['info'];
  if (info) {
    const parsed_length = parseInt(info.split(' / ')[0]);
    if (!isNaN(parsed_length)) {
      extraParameters['input_length'] = parsed_length;
    }
  }

  logEvent('submit_prompt_client_error_prompt_length', extraParameters);
}

/** Error when a file type is unhandled. */
export function logFileTypeError(file: File) {
  logEvent('submit_prompt_client_error_file_type', { object_type: file.type });
}

/** Error when a single file is too large. */
export function logFileSizeError(file: File) {
  logEvent('submit_prompt_client_error_file_size', {
    object_type: file.type,
    object_size: file.size,
  });
}

/** Error when the combined sizes of all files is too large. */
export function logCombinedFileSizeError(existingFiles: ExtendedFile[], newFiles: File[]) {
  const existingFileMetadata = existingFiles.map((file) => ({
    type: file.type ?? '',
    size: file.size,
  }));
  const newFileMetadata = newFiles.map((file) => ({
    type: file.type,
    size: file.size,
  }));
  const allMetadata = existingFileMetadata.concat(newFileMetadata);

  logEvent('submit_prompt_client_error_file_length', {
    object_type: allMetadata.map((file) => file.type),
    object_size: allMetadata.map((file) => file.size),
    // LibreChat processes text on the server, so length isn't available to us here
    object_length: allMetadata.map(() => 0),
  });
}

/** Error when too many files are uploaded for a single prompt. */
export function logFileCountError(fileCount: number) {
  logEvent('upload_files_error_file_count', { object_count: fileCount });
}
