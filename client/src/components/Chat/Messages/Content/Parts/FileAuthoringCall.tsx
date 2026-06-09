import { useMemo } from 'react';
import { FilePenLine, FilePlus2 } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import parseJsonField, { parseJsonFieldOccurrences } from './parseJsonField';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import useToolCallState from './useToolCallState';
import useLazyHighlight from './useLazyHighlight';
import CodeWindowHeader from './CodeWindowHeader';
import { AttachmentGroup } from './Attachment';
import { langFromPath } from './ReadFileCall';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type FileAuthoringToolName = 'create_file' | 'edit_file';

type ToolCallArgs = string | Record<string, unknown> | undefined;

interface TextEditPreview {
  oldText: string;
  newText: string;
}

function hasDiff(output: string): boolean {
  return /\n@@\s/.test(output) || output.includes('\n--- ') || output.includes('\n+++ ');
}

function parseArgsObject(args: ToolCallArgs): Record<string, unknown> | undefined {
  if (typeof args === 'object' && args !== null) {
    return args;
  }
  if (typeof args !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(args);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function editPreviewLines(prefix: '-' | '+', text: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function formatEditPreview(edits: TextEditPreview[]): string {
  return edits
    .map((edit, index) => {
      const suffix = edits.length > 1 ? ` ${index + 1}` : '';
      return [
        `--- old_text${suffix}`,
        `+++ new_text${suffix}`,
        '@@',
        editPreviewLines('-', edit.oldText),
        editPreviewLines('+', edit.newText),
      ].join('\n');
    })
    .join('\n\n');
}

function buildEditArgsPreview(args: ToolCallArgs): string {
  const parsed = parseArgsObject(args);
  if (Array.isArray(parsed?.edits) && parsed.edits.length > 0) {
    const edits = parsed.edits
      .map((edit): TextEditPreview | undefined => {
        if (typeof edit !== 'object' || edit === null || Array.isArray(edit)) {
          return undefined;
        }
        const entry = edit as Record<string, unknown>;
        const oldText = textValue(entry.old_text);
        const newText = textValue(entry.new_text);
        return oldText || newText ? { oldText, newText } : undefined;
      })
      .filter((edit): edit is TextEditPreview => !!edit);
    return formatEditPreview(edits);
  }

  if (parsed) {
    const oldText = textValue(parsed.old_text);
    const newText = textValue(parsed.new_text);
    return oldText || newText ? formatEditPreview([{ oldText, newText }]) : '';
  }

  /** Partial JSON during streaming: pair up field occurrences in document order, covering both single-replacement and batched `edits` args */
  const oldTexts = parseJsonFieldOccurrences(args, 'old_text');
  const newTexts = parseJsonFieldOccurrences(args, 'new_text');
  const editCount = Math.max(oldTexts.length, newTexts.length);
  const edits = Array.from({ length: editCount }, (_, index) => ({
    oldText: oldTexts[index] ?? '',
    newText: newTexts[index] ?? '',
  })).filter((edit) => edit.oldText || edit.newText);
  return formatEditPreview(edits);
}

export default function FileAuthoringCall({
  toolName,
  isSubmitting,
  initialProgress = 0.1,
  args,
  output = '',
  attachments,
  hideAttachments = false,
  onExpand,
}: {
  toolName: FileAuthoringToolName;
  initialProgress: number;
  isSubmitting: boolean;
  args?: string | Record<string, unknown>;
  output?: string;
  attachments?: TAttachment[];
  hideAttachments?: boolean;
  onExpand?: () => void;
}) {
  const localize = useLocalize();
  const isCreate = toolName === 'create_file';
  const filePath = useMemo(() => parseJsonField(args, 'file_path'), [args]);
  const authoredContent = useMemo(() => parseJsonField(args, 'content'), [args]);
  const editArgsPreview = useMemo(() => buildEditArgsPreview(args), [args]);
  const fileName = filePath.split('/').pop() || filePath;
  const fileLang = useMemo(() => langFromPath(filePath), [filePath]);
  const argsPreview = isCreate ? authoredContent : editArgsPreview;
  const outputIsDiff = hasDiff(output);
  /** A diff in the output supersedes the args preview — it carries the input with real file context */
  const preview = outputIsDiff ? output : argsPreview || output;
  const showOutputSection = !!output && preview !== output;
  const previewIsDiff = outputIsDiff || (!isCreate && !!editArgsPreview && preview !== output);
  let previewLang = 'plaintext';
  if (previewIsDiff) {
    previewLang = 'diff';
  } else if (isCreate && authoredContent && preview === authoredContent) {
    previewLang = fileLang;
  }

  const { showCode, toggleCode, expandStyle, expandRef, progress, cancelled, hasError } =
    useToolCallState(initialProgress, isSubmitting, output, !!filePath || !!preview, onExpand);

  const highlighted = useLazyHighlight(preview || undefined, previewLang);
  const Icon = isCreate ? FilePlus2 : FilePenLine;

  return (
    <>
      <div className="relative my-1.5 flex size-5 shrink-0 items-center gap-2.5">
        <ProgressText
          progress={progress}
          onClick={toggleCode}
          inProgressText={localize(isCreate ? 'com_ui_creating_file' : 'com_ui_editing_file', {
            0: fileName,
          })}
          finishedText={
            cancelled
              ? localize('com_ui_cancelled')
              : localize(isCreate ? 'com_ui_created_file' : 'com_ui_edited_file', { 0: fileName })
          }
          errorSuffix={hasError && !cancelled ? localize('com_ui_tool_failed') : undefined}
          icon={
            <Icon
              className={cn(
                'size-4 shrink-0 text-text-secondary',
                progress < 1 && !cancelled && !hasError && 'animate-pulse',
              )}
              aria-hidden="true"
            />
          }
          hasInput={!!filePath || !!preview}
          isExpanded={showCode}
          error={cancelled}
        />
      </div>
      <div style={expandStyle}>
        <div className="overflow-hidden" ref={expandRef}>
          {!!preview && (
            <div className="my-2 overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
              <CodeWindowHeader language={previewIsDiff ? 'diff' : fileName} code={preview} />
              <pre className="max-h-[300px] overflow-auto bg-surface-chat p-4 font-mono text-xs dark:bg-surface-primary-alt">
                <code className={`hljs language-${previewLang} !whitespace-pre`}>
                  {highlighted ?? preview}
                </code>
              </pre>
              {showOutputSection && (
                <pre
                  className={cn(
                    'max-h-[300px] overflow-auto whitespace-pre-wrap break-words border-t border-border-light px-3 py-2.5 font-mono text-xs',
                    hasError ? 'text-red-600 dark:text-red-400' : 'text-text-primary',
                  )}
                >
                  {output}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
      {!hideAttachments && attachments && attachments.length > 0 && (
        <AttachmentGroup attachments={attachments} />
      )}
    </>
  );
}
