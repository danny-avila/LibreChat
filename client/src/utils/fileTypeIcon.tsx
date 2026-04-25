/**
 * Shared filename → icon mapping for BKL surfaces (citations, sources panel,
 * document-search results). Pulled out of `DocumentSearch/ResultCard.tsx` so
 * the citation chip and the side-panel header render the same icon set —
 * .msg / .eml as `Mail`, .pdf as red `FileText`, etc.
 *
 * The icons are Lucide-react components; callers provide a className for the
 * sizing (`h-4 w-4` in panels, `h-3 w-3` in citation chips). Color classes
 * stay attached here so the visual identity is consistent everywhere.
 */
import React from 'react';
import {
  FileText,
  Mail,
  FileType2,
  FileSpreadsheet,
  Image as ImageIcon,
  FileAudio,
  FileVideo,
  File as FileIcon,
} from 'lucide-react';
import cn from './cn';

// Original-document extensions we want the icon to reflect even when
// the OCR pipeline has produced a `*.{ext}.md` / `*.{ext}.markdown`
// derivative. Mirrors the backend helper
// `src.api.routes.generate._file_type_for_chunk._ext_from_name`.
const DOUBLE_EXT_INNER = new Set([
  'msg', 'eml', 'pdf', 'docx', 'xlsx', 'pptx',
  'hwp', 'hwpx', 'doc', 'ppt', 'xls',
]);

export function getFileExtension(name?: string | null): string {
  if (!name) return '';
  const cleaned = name.normalize('NFC').replace(/^『(.+?)』.*$/, '$1');
  const base = cleaned.split('/').pop() ?? cleaned;
  const dot = base.lastIndexOf('.');
  if (dot === -1) return '';
  const last = base.slice(dot + 1).toLowerCase();
  // OCR output is always *.md, so for `foo.msg.md` we want `msg` (Mail
  // icon). Peek one level deeper when the last token is markdown/text.
  if (last === 'md' || last === 'markdown') {
    const stem = base.slice(0, dot);
    const innerDot = stem.lastIndexOf('.');
    if (innerDot !== -1) {
      const inner = stem.slice(innerDot + 1).toLowerCase();
      if (DOUBLE_EXT_INNER.has(inner)) return inner;
    }
  }
  return last;
}

type IconProps = {
  /** Filename or `『name』- [N]`-formatted citation header. */
  name?: string | null;
  /** Optional explicit extension (e.g. backend `metadata.file_type`). Wins
   *  over name parsing when both are present. */
  ext?: string | null;
  /** Tailwind size + extra classes. Defaults to `h-4 w-4`. */
  className?: string;
};

/**
 * Render a file-type Lucide icon for a given filename / extension.
 *
 * Lookup order:
 *   1. `ext` prop (explicit), 2. parsed from `name`, 3. fallback `FileIcon`.
 *
 * Color classes are baked in so the citation chip and the panel header share
 * the same visual cue (sky-600 = email, red-600 = PDF, blue-600 = Word).
 */
export function FileTypeIcon({ name, ext, className }: IconProps): React.ReactElement {
  const e = (ext ?? '').toLowerCase().replace(/^\./, '') || getFileExtension(name);
  const base = className ?? 'h-4 w-4 shrink-0';

  if (e === 'msg' || e === 'eml') return <Mail className={cn(base, 'text-sky-600')} />;
  if (e === 'pdf') return <FileText className={cn(base, 'text-red-600')} />;
  if (e === 'docx' || e === 'doc' || e === 'rtf') {
    return <FileType2 className={cn(base, 'text-blue-600')} />;
  }
  if (e === 'xlsx' || e === 'xls' || e === 'csv') {
    return <FileSpreadsheet className={cn(base, 'text-emerald-600')} />;
  }
  if (e === 'md' || e === 'markdown' || e === 'txt') {
    return <FileText className={cn(base, 'text-emerald-600')} />;
  }
  if (e === 'png' || e === 'jpg' || e === 'jpeg' || e === 'gif' || e === 'webp') {
    return <ImageIcon className={cn(base, 'text-purple-600')} />;
  }
  if (e === 'mp3' || e === 'wav' || e === 'm4a') {
    return <FileAudio className={cn(base, 'text-orange-600')} />;
  }
  if (e === 'mp4' || e === 'mov' || e === 'avi') {
    return <FileVideo className={cn(base, 'text-fuchsia-600')} />;
  }
  return <FileIcon className={cn(base, 'text-text-secondary')} />;
}

export function fileExtensionLabel(name?: string | null): string {
  const ext = getFileExtension(name);
  return ext ? ext.toUpperCase() : 'DOC';
}
