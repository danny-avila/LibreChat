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
  const languageIcons = [
    'python.svg',
    'nodedotjs.svg',
    'tsnode.svg',
    'rust.svg',
    'go.svg',
    'c.svg',
    'cplusplus.svg',
    'php.svg',
    'fortran.svg',
  ];

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        className="w-11/12 sm:w-[450px]"
        title=""
        main={
          <>
            <div className="mb-4 text-center font-medium">
              {localize('com_ui_librechat_code_api_title')}
            </div>
            <div className="mb-4 text-center text-sm">
              {localize('com_ui_librechat_code_api_subtitle')}
            </div>
            {/* Language Icons Stack */}
            <div className="mb-6">
              <div className="mx-auto mb-4 flex max-w-[400px] flex-wrap justify-center gap-3">
                {languageIcons.map((icon) => (
                  <div key={icon} className="h-6 w-6">
                    <img
                      src={`/assets/${icon}`}
                      alt=""
                      className="h-full w-full object-contain opacity-[0.85] dark:invert"
                    />
                  </div>
                ))}
              </div>
              <a
                href="https://code.librechat.ai/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[15px] font-medium text-blue-500 underline decoration-1 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {localize('com_ui_librechat_code_api_key')}
              </a>
            </div>
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
