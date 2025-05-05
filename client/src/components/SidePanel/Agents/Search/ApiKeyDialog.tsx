import type { UseFormRegister, UseFormHandleSubmit } from 'react-hook-form';
import type { ApiKeyFormData } from '~/common';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { Input, Button, OGDialog } from '~/components/ui';
import { useLocalize } from '~/hooks';

export default function ApiKeyDialog({
  isOpen,
  onSubmit,
  onRevoke,
  onOpenChange,
  isUserProvided,
  isToolAuthenticated,
  register,
  handleSubmit,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { apiKey: string }) => void;
  onRevoke: () => void;
  isUserProvided: boolean;
  isToolAuthenticated: boolean;
  register: UseFormRegister<ApiKeyFormData>;
  handleSubmit: UseFormHandleSubmit<ApiKeyFormData>;
}) {
  const localize = useLocalize();

  return (
    // WIP
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        className="w-11/12 sm:w-[450px]"
        title=""
        main={
          <>
            <div className="mb-4 text-center font-medium">{localize('com_ui_web_search')}</div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <Input
                type="password"
                placeholder={localize('com_ui_enter_api_key')}
                autoComplete="one-time-code"
                readOnly={true}
                onFocus={(e) => (e.target.readOnly = false)}
                {...register('apiKey', { required: true })}
              />
            </form>
          </>
        }
        selection={{
          selectHandler: handleSubmit(onSubmit),
          selectClasses: 'bg-green-500 hover:bg-green-600 text-white',
          selectText: localize('com_ui_save'),
        }}
        buttons={
          isUserProvided &&
          isToolAuthenticated && (
            <Button
              onClick={onRevoke}
              className="bg-destructive text-white transition-all duration-200 hover:bg-destructive/80"
            >
              {localize('com_ui_revoke')}
            </Button>
          )
        }
        showCancelButton={true}
      />
    </OGDialog>
  );
}
