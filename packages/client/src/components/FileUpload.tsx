import React, { forwardRef } from 'react';
import type { FileType } from './FileInput';
import { FileInput } from './FileInput';

type FileUploadProps = {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * Array of file types to accept. Can be specific MIME types or predefined type names.
   * If not provided, all files are accepted (default behavior).
   * @example ['image', 'document']
   */
  acceptTypes?: (FileType | string)[];
  /**
   * Whether to allow multiple files to be selected
   * @default true
   */
  multiple?: boolean;
};

const FileUpload = forwardRef<HTMLInputElement, FileUploadProps>(
  ({ children, handleFileChange, acceptTypes, multiple = true }, ref) => {
    return (
      <>
        {children}
        <FileInput
          ref={ref}
          acceptTypes={acceptTypes}
          multiple={multiple}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </>
    );
  },
);

FileUpload.displayName = 'FileUpload';

export default FileUpload;
