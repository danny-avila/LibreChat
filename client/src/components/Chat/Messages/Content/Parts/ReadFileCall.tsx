import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { FileText } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import { useProgress, useLocalize, useExpandCollapse } from '~/hooks';
import useLazyHighlight from './useLazyHighlight';
import CodeWindowHeader from './CodeWindowHeader';
import { AttachmentGroup } from './Attachment';
import { cn } from '~/utils';
import store from '~/store';

interface ReadFileArgs {
  file_path?: string;
}

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
  html: 'html',
  xml: 'xml',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
};

function langFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

function parseArgs(args?: string | Record<string, unknown>): ReadFileArgs {
  if (typeof args === 'object' && args !== null) {
    return { file_path: String(args.file_path ?? '') };
  }
  try {
    const parsed = JSON.parse(args || '{}');
    if (typeof parsed === 'object') {
      return { file_path: String(parsed.file_path ?? '') };
    }
  } catch {
    // fallback
  }
  const match = args?.match(/"file_path"\s*:\s*"([^"]+)"/);
  return { file_path: match ? match[1] : '' };
}

const ERROR_PATTERN = /^(Traceback|Error:|Exception:|.*Error:)/m;

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
  const hasOutput = output.length > 0;
  const autoExpand = useRecoilValue(store.autoExpandTools);

  const { file_path = '' } = useMemo(() => parseArgs(args), [args]);
  const fileName = file_path.split('/').pop() || file_path;
  const lang = useMemo(() => langFromPath(file_path), [file_path]);
  const hasContent = !!file_path || hasOutput;
  const [showCode, setShowCode] = useState(() => autoExpand && hasContent);
  const { style: expandStyle, ref: expandRef } = useExpandCollapse(showCode);

  useEffect(() => {
    if (autoExpand && hasContent) {
      setShowCode(true);
    }
  }, [autoExpand, hasContent]);
  const progress = useProgress(initialProgress);

  const highlighted = useLazyHighlight(hasOutput ? output : undefined, lang);

  const outputHasError = useMemo(() => ERROR_PATTERN.test(output), [output]);

  const toggleCode = useCallback(() => setShowCode((prev) => !prev), []);

  const cancelled = !isSubmitting && progress < 1;

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
          hasInput={hasContent}
          isExpanded={showCode}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          <div className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
            {hasOutput && !outputHasError && (
              <>
                <CodeWindowHeader language={fileName} code={output} />
                <pre className="max-h-[300px] overflow-auto bg-surface-chat p-4 font-mono text-xs dark:bg-surface-primary-alt">
                  <code className={`hljs language-${lang} !whitespace-pre`}>{highlighted}</code>
                </pre>
              </>
            )}
            {hasOutput && outputHasError && (
              <div className="bg-surface-primary-alt p-4 text-xs dark:bg-transparent">
                <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap break-words font-mono text-red-600 dark:text-red-400">
                  {output}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
      {attachments && attachments.length > 0 && <AttachmentGroup attachments={attachments} />}
    </>
  );
}
