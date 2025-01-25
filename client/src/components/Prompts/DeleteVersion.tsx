import { Trash2 } from 'lucide-react';
import { Button, OGDialog, OGDialogTrigger, Label } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize } from '~/hooks';

const DeleteVersion = ({
  name,
  disabled,
  selectHandler,
}: {
  name: string;
  disabled?: boolean;
  selectHandler: () => void;
}) => {
  const localize = useLocalize();

  return (
    <OGDialog>
      <OGDialogTrigger asChild>
        <Button
          variant="default"
          size="sm"
          className="h-10 w-10 border border-transparent bg-red-600 transition-all hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-800 p-0.5"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Trash2 className="cursor-pointer text-white size-5" />
        </Button>
      </OGDialogTrigger>
      <OGDialogTemplate
        showCloseButton={false}
        title={localize('com_ui_delete_prompt')}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label
                  htmlFor="dialog-delete-confirm-prompt"
                  className="text-left text-sm font-medium"
                >
                  {localize('com_ui_delete_confirm_prompt_version_var', name)}
                </Label>
              </div>
            </div>
          </>
        }
        selection={{
          selectHandler,
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
};

export default DeleteVersion;
