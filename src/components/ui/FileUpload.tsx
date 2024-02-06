import React, { useRef } from 'react';

type FileUploadProps = {
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
};

const FileUpload: React.FC<FileUploadProps> = ({
  handleFileChange,
  children,
  onClick,
  className = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    if (onClick) {
      onClick();
    }
    // necessary to reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  return (
    <div onClick={handleButtonClick} style={{ cursor: 'pointer' }} className={className}>
      {children}
      <input
        ref={fileInputRef}
        multiple
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
};

export default FileUpload;
