import { useRef, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Upload, FileIcon, Trash2, FolderOpen } from 'lucide-react';
import type { TFile } from 'librechat-data-provider';
import {
  useGetProjectQuery,
  useGetFiles,
  useUploadFileMutation,
  useAddFileToProjectMutation,
  useRemoveFileFromProjectMutation,
} from '~/data-provider';
import store from '~/store';

export default function ProjectFilesPanel() {
  const activeProjectId = useRecoilValue(store.activeProjectId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: project } = useGetProjectQuery(activeProjectId ?? '', {
    enabled: !!activeProjectId,
  });
  const { data: allFiles = [] } = useGetFiles<TFile[]>({
    enabled: !!activeProjectId,
  });

  const uploadMutation = useUploadFileMutation();
  const addFileMutation = useAddFileToProjectMutation();
  const removeFileMutation = useRemoveFileFromProjectMutation();

  const projectFileIds = project?.fileIds || [];
  const projectFiles = allFiles.filter((f) => projectFileIds.includes(f.file_id));

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeProjectId) {
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('file_id', `project-${Date.now()}`);

      uploadMutation.mutate(formData, {
        onSuccess: (data) => {
          addFileMutation.mutate({ projectId: activeProjectId, fileId: data.file_id });
        },
      });

      // Reset the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [activeProjectId, uploadMutation, addFileMutation],
  );

  const handleRemove = useCallback(
    (fileId: string) => {
      if (!activeProjectId) {
        return;
      }
      removeFileMutation.mutate({ projectId: activeProjectId, fileId });
    },
    [activeProjectId, removeFileMutation],
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  if (!activeProjectId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <FolderOpen className="h-8 w-8 text-text-tertiary" />
        <p className="text-sm text-text-secondary">
          Select a project to manage its files.
        </p>
        <p className="text-xs text-text-tertiary">
          Project files are automatically included in the context of all project conversations.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-auto max-w-full flex-col gap-2 overflow-x-hidden p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">
          Project Files ({projectFiles.length})
        </h3>
        <button
          className="rounded-md p-1 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isLoading}
        >
          <Upload className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleUpload}
          accept=".txt,.md,.json,.csv,.xml,.html,.js,.ts,.py,.java,.c,.cpp,.go,.rs,.yaml,.yml,.toml,.ini,.cfg,.env,.sh,.bat,.sql,.graphql"
        />
      </div>

      {uploadMutation.isLoading && (
        <div className="rounded-lg border border-border-light bg-surface-primary p-2 text-center text-xs text-text-secondary">
          Uploading...
        </div>
      )}

      {projectFiles.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-tertiary">
          No files yet. Upload text files to include them as context in all project conversations.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {projectFiles.map((file) => (
            <div
              key={file.file_id}
              className="group flex items-center gap-2 rounded-lg border border-border-light p-2"
            >
              <FileIcon className="h-4 w-4 flex-shrink-0 text-text-tertiary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary">{file.filename}</p>
                <p className="text-xs text-text-tertiary">{formatBytes(file.bytes)}</p>
              </div>
              <button
                className="flex-shrink-0 rounded p-0.5 text-text-secondary opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                onClick={() => handleRemove(file.file_id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
