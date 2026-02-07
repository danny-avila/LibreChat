import {
  Button,
  OGDialog,
  SecretInput,
  OGDialogClose,
  OGDialogTitle,
  OGDialogFooter,
  OGDialogHeader,
  OGDialogContent,
  OGDialogDescription,
} from '@librechat/client';
import type { UseFormRegister, UseFormHandleSubmit } from 'react-hook-form';
import type { ApiKeyFormData } from '~/common';
import type { RefObject } from 'react';
import { useLocalize } from '~/hooks';

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
  'r.svg',
];

export default function ApiKeyDialog({
  isOpen,
  onSubmit,
  onRevoke,
  onOpenChange,
  isUserProvided,
  isToolAuthenticated,
  register,
  handleSubmit,
  triggerRef,
  triggerRefs,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { apiKey: string }) => void;
  onRevoke: () => void;
  isUserProvided: boolean;
  isToolAuthenticated: boolean;
  register: UseFormRegister<ApiKeyFormData>;
  handleSubmit: UseFormHandleSubmit<ApiKeyFormData>;
  triggerRef?: RefObject<HTMLInputElement | HTMLButtonElement>;
  triggerRefs?: RefObject<HTMLInputElement | HTMLButtonElement>[];
}) {
  const localize = useLocalize();

  return (
    <OGDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      triggerRefs={triggerRefs}
    >
      <OGDialogContent
        showCloseButton={false}
        className="w-11/12 max-w-md border-none bg-surface-primary"
      >
        <OGDialogHeader className="gap-2 py-2">
          <OGDialogTitle className="text-center text-lg font-semibold">
            {localize('com_ui_librechat_code_api_title')}
          </OGDialogTitle>
          <div className="mx-auto flex max-w-[350px] flex-wrap justify-center gap-3">
            {languageIcons.map((icon) => (
              <div key={icon} className="size-6">
                <img
                  src={`assets/${icon}`}
                  alt=""
                  className="size-full object-contain opacity-85 dark:invert"
                />
              </div>
            ))}
          </div>
          <OGDialogDescription className="text-center">
            {localize('com_ui_librechat_code_api_subtitle')}
          </OGDialogDescription>
        </OGDialogHeader>

        <div className="space-y-4">
          <a
            href="https://code.librechat.ai/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm font-medium text-blue-500 underline decoration-1 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {localize('com_ui_librechat_code_api_key')}
          </a>

          <form onSubmit={handleSubmit(onSubmit)}>
            <SecretInput
              placeholder={localize('com_ui_enter_api_key')}
              {...register('apiKey', { required: true })}
            />
          </form>
        </div>

        <OGDialogFooter className="mt-6">
          <OGDialogClose asChild>
            <Button variant="outline" className="h-10">
              {localize('com_ui_cancel')}
            </Button>
          </OGDialogClose>
          {isUserProvided && isToolAuthenticated && (
            <Button
              variant="destructive"
              onClick={onRevoke}
              className="h-10"
              aria-label={localize('com_ui_revoke')}
            >
              {localize('com_ui_revoke')}
            </Button>
          )}
          <Button variant="submit" onClick={handleSubmit(onSubmit)} className="h-10">
            {localize('com_ui_save')}
          </Button>
        </OGDialogFooter>
      </OGDialogContent>
    </OGDialog>
  );
}
