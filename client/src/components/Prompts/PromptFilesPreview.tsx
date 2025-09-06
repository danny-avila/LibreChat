import React, { useMemo } from 'react';
import { Paperclip, FileText, Image, FileType } from 'lucide-react';
import type { AgentToolResources } from 'librechat-data-provider';
import { useGetFiles } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface PromptFilesPreviewProps {
  toolResources: AgentToolResources;
}

const PromptFilesPreview: React.FC<PromptFilesPreviewProps> = ({ toolResources }) => {
  const localize = useLocalize();
  const { data: allFiles = [] } = useGetFiles();

  // Create a fileMap for quick lookup
  const fileMap = useMemo(() => {
    const map: Record<string, any> = {};
    allFiles.forEach((file) => {
      if (file.file_id) {
        map[file.file_id] = file;
      }
    });
    return map;
  }, [allFiles]);

  // Extract all file IDs from tool resources
  const attachedFiles = useMemo(() => {
    const files: Array<{ file: any; toolResource: string }> = [];

    Object.entries(toolResources).forEach(([toolResource, resource]) => {
      if (resource?.file_ids) {
        resource.file_ids.forEach((fileId) => {
          const dbFile = fileMap[fileId];
          if (dbFile) {
            files.push({ file: dbFile, toolResource });
          }
        });
      }
    });

    return files;
  }, [toolResources, fileMap]);

  const getFileIcon = (type: string) => {
    if (type?.startsWith('image/')) {
      return <Image className="h-4 w-4" />;
    }
    if (type?.includes('text') || type?.includes('document')) {
      return <FileText className="h-4 w-4" />;
    }
    return <FileType className="h-4 w-4" />;
  };

  const getToolResourceLabel = (toolResource: string) => {
    switch (toolResource) {
      case 'file_search':
        return 'File Search';
      case 'execute_code':
        return 'Code Interpreter';
      case 'ocr':
        return 'Text Extraction';
      case 'image_edit':
        return 'Image Editing';
      default:
        return toolResource;
    }
  };

  if (attachedFiles.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="flex items-center justify-between rounded-t-lg border border-border-light py-2 pl-4 text-base font-semibold text-text-primary">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          {localize('com_ui_files')} ({attachedFiles.length})
        </div>
      </h2>
      <div className="rounded-b-lg border border-border-light p-4">
        <div className="space-y-3">
          {attachedFiles.map(({ file, toolResource }, index) => (
            <div
              key={`${file.file_id}-${index}`}
              className="flex items-center justify-between rounded-lg border border-border-light p-3 transition-colors hover:bg-surface-tertiary"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-secondary text-text-secondary">
                  {getFileIcon(file.type)}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text-primary" title={file.filename}>
                    {file.filename}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <span>{getToolResourceLabel(toolResource)}</span>
                    {file.bytes && (
                      <>
                        <span>•</span>
                        <span>{(file.bytes / 1024).toFixed(1)} KB</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {file.type?.startsWith('image/') && file.width && file.height && (
                <div className="text-xs text-text-secondary">
                  {file.width} × {file.height}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PromptFilesPreview;
