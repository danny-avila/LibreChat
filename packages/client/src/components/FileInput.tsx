import * as React from 'react';

export type FileType =
  | 'image'
  | 'image_document'
  | 'image_document_video_audio'
  | 'document'
  | 'video'
  | 'audio'
  | 'all';

export interface FileInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'accept'> {
  /**
   * Array of file types to accept. Can be specific MIME types or predefined type names.
   * Predefined types:
   * - 'image': Images only (png, jpg, jpeg, gif, webp, heic, heif)
   * - 'document': Documents only (pdf, doc, docx, txt, md, csv, xls, xlsx)
   * - 'video': Videos only (mp4, webm, ogg, mov)
   * - 'audio': Audio only (mp3, wav, ogg, webm)
   * - 'image_document': Images and PDFs
   * - 'image_document_video_audio': All media types
   * - 'all': All files
   * @example ['image']
   * @example ['image', 'document']
   * @example ['image/png', 'application/pdf']
   */
  acceptTypes?: (FileType | string)[];
  /**
   * Whether to allow multiple files to be selected
   * @default false
   */
  multiple?: boolean;
}

/**
 * Predefined file type mappings matching the codebase's file upload patterns
 * These align with the patterns used in AttachFileMenu and throughout LibreChat
 */
const FILE_TYPE_MAP: Record<FileType, string> = {
  image: 'image/*,.heif,.heic',
  document: '.pdf,application/pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx',
  video: 'video/*',
  audio: 'audio/*',
  image_document: 'image/*,.heif,.heic,.pdf,application/pdf',
  image_document_video_audio: 'image/*,.heif,.heic,.pdf,application/pdf,video/*,audio/*',
  all: '*',
};

/**
 * Converts an array of file types to an accept string
 */
function getAcceptString(types?: (FileType | string)[]): string | undefined {
  if (!types || types.length === 0) {
    return undefined;
  }

  const acceptValues = types.map((type) => {
    // If it's a predefined type, use the mapping
    if (type in FILE_TYPE_MAP) {
      return FILE_TYPE_MAP[type as FileType];
    }
    // Otherwise, treat it as a custom MIME type or extension
    return type;
  });

  return acceptValues.join(',');
}

/**
 * A reusable file input component with configurable file type acceptance.
 *
 * @example
 * ```tsx
 * // Image files only
 * <FileInput acceptTypes={['image']} onChange={handleChange} ref={inputRef} />
 *
 * // Images and documents
 * <FileInput acceptTypes={['image', 'document']} multiple onChange={handleChange} />
 *
 * // Custom MIME types
 * <FileInput acceptTypes={['image/png', 'application/json']} onChange={handleChange} />
 *
 * // All files
 * <FileInput acceptTypes={['all']} onChange={handleChange} />
 * ```
 */
const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  ({ acceptTypes, multiple = false, ...props }, ref) => {
    const accept = getAcceptString(acceptTypes);

    return <input type="file" accept={accept} multiple={multiple} ref={ref} {...props} />;
  },
);

FileInput.displayName = 'FileInput';

export { FileInput, FILE_TYPE_MAP };
