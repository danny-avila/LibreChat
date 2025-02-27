import { useMemo, memo } from 'react';
import { useRecoilValue } from 'recoil';
import { EditIcon } from 'lucide-react';
import type { PluggableList } from 'unified';
import rehypeHighlight from 'rehype-highlight';
import { Controller, useFormContext, useFormState } from 'react-hook-form';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import ReactMarkdown from 'react-markdown';
import { codeNoExecution } from '~/components/Chat/Messages/Content/Markdown';
import AlwaysMakeProd from '~/components/Prompts/Groups/AlwaysMakeProd';
import { SaveIcon, CrossIcon } from '~/components/svg';
import { TextareaAutosize } from '~/components/ui';
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
  const { dirtyFields } = useFormState({ control: control });
  const { prompt } = dirtyFields as { prompt?: string };

  const EditorIcon = useMemo(() => {
    if (isEditing && prompt?.length == null) {
      return CrossIcon;
    }
    return isEditing ? SaveIcon : EditIcon;
  }, [isEditing, prompt]);

  const rehypePlugins: PluggableList = [
    [rehypeKatex, { output: 'mathml' }],
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
      <h2 className="flex items-center justify-between rounded-t-xl border border-border-light py-1.5 pl-3 text-sm font-semibold text-text-primary sm:py-2 sm:pl-4 sm:text-base">
        <span className="max-w-[200px] truncate sm:max-w-none">
          {localize('com_ui_prompt_text')}
        </span>
        <div className="flex shrink-0 flex-row gap-3 sm:gap-6">
          {editorMode === PromptsEditorMode.ADVANCED && (
            <AlwaysMakeProd className="hidden sm:flex" />
          )}
          <button
            type="button"
            onClick={() => setIsEditing((prev) => !prev)}
            aria-label={isEditing ? localize('com_ui_save') : localize('com_ui_edit')}
            className="mr-1 rounded-lg p-1.5 sm:mr-2 sm:p-1"
          >
            <EditorIcon
              className={cn(
                'h-5 w-5 sm:h-6 sm:w-6',
                isEditing ? 'p-[0.05rem]' : 'text-secondary-alt hover:text-text-primary',
              )}
            />
          </button>
        </div>
      </h2>
      <div
        role="button"
        className={cn(
          'w-full flex-1 overflow-auto rounded-b-xl border border-border-light p-2 shadow-md transition-all duration-150 sm:p-4',
          {
            'cursor-pointer bg-surface-primary hover:bg-surface-secondary active:bg-surface-tertiary':
              !isEditing,
          },
        )}
        onClick={() => !isEditing && setIsEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            !isEditing && setIsEditing(true);
          }
        }}
        tabIndex={0}
      >
        {!isEditing && (
          <EditIcon className="icon-xl absolute inset-0 m-auto hidden h-6 w-6 text-text-primary opacity-25 group-hover:block sm:h-8 sm:w-8" />
        )}
        <Controller
          name={name}
          control={control}
          render={({ field }) =>
            isEditing ? (
              <TextareaAutosize
                {...field}
                autoFocus
                className="w-full resize-none overflow-y-auto rounded bg-transparent text-sm text-text-primary focus:outline-hidden sm:text-base"
                minRows={3}
                maxRows={14}
                onBlur={() => setIsEditing(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsEditing(false);
                  }
                }}
              />
            ) : (
              <div
                className={cn('overflow-y-auto text-sm sm:text-base')}
                style={{ minHeight: '4.5em', maxHeight: '21em', overflow: 'auto' }}
              >
                <ReactMarkdown
                  /** @ts-ignore */
                  remarkPlugins={[
                    supersub,
                    remarkGfm,
                    [remarkMath, { singleDollarTextMath: true }],
                  ]}
                  /** @ts-ignore */
                  rehypePlugins={rehypePlugins}
                  /** @ts-ignore */
                  components={{ p: PromptVariableGfm, code: codeNoExecution }}
                  className="markdown prose dark:prose-invert light my-1 w-full break-words text-text-primary"
                >
                  {field.value}
                </ReactMarkdown>
              </div>
            )
          }
        />
      </div>
    </div>
  );
};

export default memo(PromptEditor);
