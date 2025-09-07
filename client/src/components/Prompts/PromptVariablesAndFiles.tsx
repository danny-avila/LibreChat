import React from 'react';
import type { ExtendedFile } from '~/common';
import PromptVariables from './PromptVariables';
import PromptFiles from './PromptFiles';

interface PromptVariablesAndFilesProps {
  promptText: string;
  files?: ExtendedFile[];
  onFilesChange?: (files: ExtendedFile[]) => void;
  handleFileChange?: (event: React.ChangeEvent<HTMLInputElement>, toolResource?: string) => void;
  disabled?: boolean;
  showVariablesInfo?: boolean;
  onFileChange?: (files: ExtendedFile[]) => void;
}

const PromptVariablesAndFiles: React.FC<PromptVariablesAndFilesProps> = ({
  promptText,
  files = [],
  onFilesChange,
  handleFileChange,
  disabled,
  showVariablesInfo = true,
  onFileChange,
}) => {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
      {/* Variables Section */}
      <div className="w-full">
        <PromptVariables promptText={promptText} showInfo={showVariablesInfo} />
      </div>

      {/* Files Section */}
      <div className="w-full">
        <PromptFiles
          files={files}
          onFilesChange={onFilesChange}
          handleFileChange={handleFileChange}
          disabled={disabled}
          onFileChange={onFileChange}
        />
      </div>
    </div>
  );
};

export default PromptVariablesAndFiles;
