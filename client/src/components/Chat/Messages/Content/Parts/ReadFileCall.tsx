import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import useToolCallState from './useToolCallState';
import useLazyHighlight from './useLazyHighlight';
import CodeWindowHeader from './CodeWindowHeader';
import { AttachmentGroup } from './Attachment';
import parseJsonField from './parseJsonField';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const LANG_MAP: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  jsx: 'javascript',
  rs: 'rust',
  go: 'go',
  rb: 'ruby',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  r: 'r',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  sql: 'sql',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  xml: 'xml',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
};

const FILENAME_MAP: Record<string, string> = {
  makefile: 'makefile',
  dockerfile: 'dockerfile',
};

export function langFromPath(filePath: string): string {
  const name = filePath.split('/').pop()?.toLowerCase() ?? '';
  const byName = FILENAME_MAP[name];
  if (byName) {
    return byName;
  }
  const ext = name.includes('.') ? (name.split('.').pop() ?? '') : '';
  return LANG_MAP[ext] ?? 'plaintext';
}

export default function ReadFileCall({
  isSubmitting,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
}: {
  initialProgress: number;
  isSubmitting: boolean;
  args?: string | Record<string, unknown>;
  output?: string;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const filePath = useMemo(() => parseJsonField(args, 'file_path'), [args]);
  const fileName = filePath.split('/').pop() || filePath;
  const lang = useMemo(() => langFromPath(filePath), [filePath]);

  const { showCode, toggleCode, expandStyle, expandRef, progress, cancelled, hasOutput } =
    useToolCallState(initialProgress, isSubmitting, output, !!filePath);

  const highlighted = useLazyHighlight(hasOutput ? output : undefined, lang);

  return (
    <>
      <div className="relative my-1.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={toggleCode}
          inProgressText={localize('com_ui_reading_file', { 0: fileName })}
          finishedText={
            cancelled ? localize('com_ui_cancelled') : localize('com_ui_read_file', { 0: fileName })
          }
          icon={
            <FileText
              className={cn(
                'size-4 shrink-0 text-text-secondary',
                progress < 1 && !cancelled && 'animate-pulse',
              )}
              aria-hidden="true"
            />
          }
          hasInput={!!filePath || hasOutput}
          isExpanded={showCode}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          {hasOutput && (
            <div className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
              <CodeWindowHeader language={fileName} code={output} />
              <pre className="max-h-[300px] overflow-auto bg-surface-chat p-4 font-mono text-xs dark:bg-surface-primary-alt">
                <code className={`hljs language-${lang} !whitespace-pre`}>{highlighted}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
