import { useMemo, memo } from 'react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import supersub from 'remark-supersub';
import { useRecoilValue } from 'recoil';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { EditIcon, FileText, Check } from 'lucide-react';
import { Controller, useFormContext } from 'react-hook-form';
import { TextareaAutosize, Button, TooltipAnchor } from '@librechat/client';
import type { PluggableList } from 'unified';
import { codeNoExecution } from '~/components/Chat/Messages/Content/MarkdownComponents';
import AlwaysMakeProd from '../buttons/AlwaysMakeProd';
import VariablesDropdown from './VariablesDropdown';
import { PromptVariableGfm } from './Markdown';
import { PromptsEditorMode } from '~/common';
import { cn, langSubset } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

const { promptsEditorMode } = store;

type Props = {
  name: string;
  isEditing: boolean;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
};

const PromptEditor: React.FC<Props> = ({ name, isEditing, setIsEditing }) => {
  const localize = useLocalize();
  const { control } = useFormContext();
  const editorMode = useRecoilValue(promptsEditorMode);

  const EditorIcon = useMemo(() => {
    return isEditing ? Check : EditIcon;
  }, [isEditing]);

  const rehypePlugins: PluggableList = [
    [rehypeKatex],
    [
      rehypeHighlight,
      {
        detect: true,
        ignoreMissing: true,
        subset: langSubset,
      },
    ],
  ];

  return (
    <div className="flex max-h-[85vh] flex-col sm:max-h-[85vh]">
      <h2 className="sr-only">{localize('com_ui_control_bar')}</h2>
      <header className="flex items-center justify-between rounded-t-xl border border-border-light bg-transparent p-2">
        <div className="ml-1 flex items-center gap-2">
          <FileText className="size-4 text-text-secondary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-text-primary">
            {localize('com_ui_prompt_text')}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editorMode === PromptsEditorMode.ADVANCED && (
            <AlwaysMakeProd className="hidden sm:flex" />
          )}
          <VariablesDropdown fieldName={name} />
          <TooltipAnchor
            description={isEditing ? localize('com_ui_save') : localize('com_ui_edit')}
            render={
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setIsEditing((prev) => !prev)}
                aria-label={isEditing ? localize('com_ui_save') : localize('com_ui_edit')}
                className="size-8 p-0 hover:bg-surface-tertiary"
              >
                <EditorIcon className="size-4 text-text-secondary" aria-hidden="true" />
              </Button>
            }
          />
        </div>
      </header>
      <div
        role="button"
        aria-label={isEditing ? localize('com_ui_prompt_input') : localize('com_ui_edit')}
        className={cn(
          'relative w-full flex-1 overflow-auto rounded-b-xl border border-t-0 border-border-light p-3 transition-all duration-200 sm:p-4',
          isEditing
            ? 'bg-surface-primary'
            : 'cursor-pointer bg-surface-primary hover:bg-surface-secondary',
        )}
        onClick={() => !isEditing && setIsEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            !isEditing && setIsEditing(true);
          }
        }}
        tabIndex={isEditing ? -1 : 0}
      >
        <Controller
          name={name}
          control={control}
          render={({ field }) =>
            isEditing ? (
              <TextareaAutosize
                {...field}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full resize-none overflow-y-auto bg-transparent font-mono text-sm leading-relaxed text-text-primary placeholder:text-text-tertiary focus:outline-none sm:text-base"
                minRows={4}
                maxRows={16}
                onBlur={() => setIsEditing(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsEditing(false);
                  }
                }}
                placeholder={localize('com_ui_prompt_input')}
                aria-label={localize('com_ui_prompt_input')}
              />
            ) : (
              <div
                className="group/preview relative min-h-[6rem] overflow-y-auto text-sm sm:text-base"
                style={{ maxHeight: '24rem' }}
              >
                {!field.value ? (
                  <p className="italic text-text-tertiary">{localize('com_ui_click_to_edit')}</p>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[
                      /** @ts-ignore */
                      supersub,
                      remarkGfm,
                      [remarkMath, { singleDollarTextMath: false }],
                    ]}
                    /** @ts-ignore */
                    rehypePlugins={rehypePlugins}
                    /** @ts-ignore */
                    components={{ p: PromptVariableGfm, code: codeNoExecution }}
                    className="markdown prose dark:prose-invert light w-full break-words text-text-primary"
                  >
                    {field.value}
                  </ReactMarkdown>
                )}
                <div className="bg-surface-secondary/0 group-hover/preview:bg-surface-secondary/50 pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-200 group-hover/preview:opacity-100">
                  <div className="flex items-center gap-2 rounded-lg bg-surface-primary px-3 py-1.5 shadow-md">
                    <EditIcon className="size-4 text-text-secondary" aria-hidden="true" />
                    <span className="text-sm font-medium text-text-secondary">
                      {localize('com_ui_click_to_edit')}
                    </span>
                  </div>
                </div>
              </div>
            )
          }
        />
      </div>
    </div>
  );
};

export default memo(PromptEditor);
