import { useMemo } from 'react';
import { FilePenLine, FilePlus2 } from 'lucide-react';
import type { TAttachment } from 'librechat-data-provider';
import ProgressText from '~/components/Chat/Messages/Content/ProgressText';
import useToolCallState from './useToolCallState';
import useLazyHighlight from './useLazyHighlight';
import CodeWindowHeader from './CodeWindowHeader';
import { AttachmentGroup } from './Attachment';
import parseJsonField from './parseJsonField';
import { langFromPath } from './ReadFileCall';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type FileAuthoringToolName = 'create_file' | 'edit_file';

function hasDiff(output: string): boolean {
  return /\n@@\s/.test(output) || output.includes('\n--- ') || output.includes('\n+++ ');
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
  const fileName = filePath.split('/').pop() || filePath;
  const fileLang = useMemo(() => langFromPath(filePath), [filePath]);
  const outputIsDiff = hasDiff(output);
  const preview = outputIsDiff || !isCreate ? output : authoredContent || output;
  let previewLang = 'plaintext';
  if (outputIsDiff) {
    previewLang = 'diff';
  } else if (isCreate && authoredContent) {
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
              <CodeWindowHeader language={outputIsDiff ? 'diff' : fileName} code={preview} />
              <pre className="max-h-[300px] overflow-auto bg-surface-chat p-4 font-mono text-xs dark:bg-surface-primary-alt">
                <code className={`hljs language-${previewLang} !whitespace-pre`}>
                  {highlighted ?? preview}
                </code>
              </pre>
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
