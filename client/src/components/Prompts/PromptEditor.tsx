import { useMemo, memo } from 'react';
import { useRecoilValue } from 'recoil';
import { EditIcon } from 'lucide-react';
import { Controller, useFormContext, useFormState } from 'react-hook-form';
import AlwaysMakeProd from '~/components/Prompts/Groups/AlwaysMakeProd';
import { SaveIcon, CrossIcon } from '~/components/svg';
import { TextareaAutosize } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const { PromptsEditorMode, promptsEditorMode } = store;

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

  const EditorIcon = useMemo(() => {
    if (isEditing && !dirtyFields.prompt) {
      return CrossIcon;
    }
    return isEditing ? SaveIcon : EditIcon;
  }, [isEditing, dirtyFields.prompt]);

  return (
    <div>
      <h2 className="flex items-center justify-between rounded-t-lg border border-gray-300 py-2 pl-4 text-base font-semibold dark:border-gray-600 dark:text-gray-200">
        {localize('com_ui_prompt_text')}
        <div className="flex flex-row gap-6">
          {editorMode === PromptsEditorMode.ADVANCED && (
            <AlwaysMakeProd className="hidden sm:flex" />
          )}
          <button type="button" onClick={() => setIsEditing((prev) => !prev)} className="mr-2">
            <EditorIcon
              className={cn(
                'icon-lg',
                isEditing ? 'p-[0.05rem]' : 'text-gray-400 hover:text-gray-600',
              )}
            />
          </button>
        </div>
      </h2>
      <div
        className={cn(
          'group relative min-h-32 rounded-b-lg border border-gray-300 p-4 transition-all duration-150 hover:opacity-90 dark:border-gray-600',
          { 'cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-100/10': !isEditing },
        )}
        onClick={() => !isEditing && setIsEditing(true)}
      >
        {!isEditing && (
          <EditIcon className="icon-xl absolute inset-0 m-auto hidden opacity-25 group-hover:block dark:text-gray-200" />
        )}
        <Controller
          name={name}
          control={control}
          render={({ field }) =>
            isEditing ? (
              <TextareaAutosize
                {...field}
                className="w-full rounded border border-gray-300 bg-transparent px-2 py-1 focus:outline-none dark:border-gray-600 dark:text-gray-200"
                minRows={3}
                onBlur={() => setIsEditing(false)}
              />
            ) : (
              <span className="block break-words px-2 py-1 dark:text-gray-200">{field.value}</span>
            )
          }
        />
      </div>
    </div>
  );
};

export default memo(PromptEditor);
