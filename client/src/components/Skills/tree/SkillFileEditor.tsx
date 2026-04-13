import { useState, useCallback, useRef } from 'react';
import { Save, FileText, Circle } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import { useGetSkillNodeContentQuery, useUpdateSkillNodeContentMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface SkillFileEditorProps {
  skillId: string;
  nodeId: string;
  fileName: string;
}

export default function SkillFileEditor({ skillId, nodeId, fileName }: SkillFileEditorProps) {
  const localize = useLocalize();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localContent, setLocalContent] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const { data, isLoading } = useGetSkillNodeContentQuery(skillId, nodeId);
  const updateContent = useUpdateSkillNodeContentMutation(skillId);

  const serverContent = data?.content ?? '';
  const displayContent = localContent ?? serverContent;

  const prevNodeIdRef = useRef(nodeId);
  if (prevNodeIdRef.current !== nodeId) {
    prevNodeIdRef.current = nodeId;
    setLocalContent(null);
    setIsDirty(false);
  }

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setLocalContent(newValue);
      setIsDirty(newValue !== serverContent);
    },
    [serverContent],
  );

  const handleSave = useCallback(() => {
    if (!isDirty || localContent === null) {
      return;
    }
    updateContent.mutate(
      { skillId, nodeId, content: localContent },
      {
        onSuccess: () => {
          setIsDirty(false);
        },
      },
    );
  }, [skillId, nodeId, localContent, isDirty, updateContent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-presentation">
        <Spinner className="text-text-tertiary" />
      </div>
    );
  }

  const lineCount = displayContent.split('\n').length;

  return (
    <div className="flex h-full flex-col bg-presentation" onKeyDown={handleKeyDown}>
      <div className="flex items-center gap-2 border-b border-border-light px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-text-primary">{fileName}</span>
          <Circle
            className={cn(
              'size-2 shrink-0 transition-[opacity,color] duration-200',
              isDirty ? 'fill-current text-yellow-500 opacity-100' : 'opacity-0',
            )}
            aria-hidden="true"
          />
        </div>
        <Button
          type="button"
          variant={isDirty ? 'submit' : 'outline'}
          size="sm"
          disabled={!isDirty || updateContent.isLoading}
          onClick={handleSave}
          aria-label={localize('com_ui_save')}
          className="h-7 gap-1.5 px-2.5 text-xs"
        >
          <Save className="size-3" />
          {localize('com_ui_save')}
        </Button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={displayContent}
          onChange={handleChange}
          spellCheck={false}
          className={cn(
            'size-full resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-6 text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary',
            'selection:bg-blue-500/20',
          )}
          aria-label={`${localize('com_ui_edit')} ${fileName}`}
        />
      </div>
      <div className="flex items-center justify-between border-t border-border-light px-4 py-1">
        <span className="text-[11px] text-text-secondary">
          {lineCount === 1
            ? localize('com_ui_line_count', { 0: String(lineCount) })
            : localize('com_ui_lines_count', { 0: String(lineCount) })}
        </span>
        <span className="text-[11px] text-text-secondary">
          {isDirty ? localize('com_ui_file_modified') : localize('com_ui_saved')}
        </span>
      </div>
    </div>
  );
}
