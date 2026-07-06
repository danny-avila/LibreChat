export type LocalFolderStatus =
  | 'loading'
  | 'unsupported'
  | 'disconnected'
  | 'connected'
  | 'needs_reconnect';

export type LocalDirEntry = {
  name: string;
  kind: FileSystemHandleKind;
};

export type LocalFileTextResult = {
  kind: 'text';
  name: string;
  content: string;
};

export type LocalFileImageResult = {
  kind: 'image';
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export type LocalFileReadResult = LocalFileTextResult | LocalFileImageResult;

export type StoredLocalFolder = {
  handle: FileSystemDirectoryHandle;
  folderName: string;
};

export type LocalFilesContextValue = {
  status: LocalFolderStatus;
  folderName: string | null;
  isSupported: boolean;
  error: string | null;
  connectFolder: () => Promise<void>;
  reconnectFolder: () => Promise<void>;
  disconnectFolder: () => Promise<void>;
  listDir: (path: string) => Promise<LocalDirEntry[]>;
  readFile: (path: string) => Promise<LocalFileReadResult>;
  writeFile: (path: string, content: string) => Promise<void>;
};
