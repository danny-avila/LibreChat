import { inferMimeType } from 'librechat-data-provider';

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  const rounded = index === 0 || value >= 10 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[index]}`;
}

export type DragDropFileIcon = 'image' | 'document' | 'generic';

export function getDragDropFileIcon(name: string, type: string): DragDropFileIcon {
  const mime = inferMimeType(name, type);
  if (mime?.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || mime?.startsWith('text/')) return 'document';
  return 'generic';
}
