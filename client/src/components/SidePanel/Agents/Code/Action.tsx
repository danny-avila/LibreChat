import { useRef } from 'react';
import { KeyRoundIcon } from 'lucide-react';
import { AuthType, AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import {
  Checkbox,
  HoverCard,
  CircleHelpIcon,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from '@librechat/client';
import type { AgentForm } from '~/common';
import { useLocalize, useCodeApiKeyForm } from '~/hooks';
import ApiKeyDialog from './ApiKeyDialog';
import { ESide } from '~/common';

export default function Action({ authType = '', isToolAuthenticated = false }) {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue } = methods;
  const apiKeyButtonRef = useRef<HTMLButtonElement>(null);
  const {
    onSubmit,
    isDialogOpen,
    setIsDialogOpen,
    handleRevokeApiKey,
    methods: keyFormMethods,
  } = useCodeApiKeyForm({
    onSubmit: () => {
      setValue(AgentCapabilities.execute_code, true, { shouldDirty: true });
      setTimeout(() => apiKeyButtonRef.current?.focus(), 100);
    },
    onRevoke: () => {
      setValue(AgentCapabilities.execute_code, false, { shouldDirty: true });
      setTimeout(() => apiKeyButtonRef.current?.focus(), 100);
    },
  });

  const runCodeIsEnabled = useWatch({ control, name: AgentCapabilities.execute_code });
  const isUserProvided = authType === AuthType.USER_PROVIDED;

  const handleCheckboxChange = (checked: boolean) => {
    if (isToolAuthenticated) {
      setValue(AgentCapabilities.execute_code, checked, { shouldDirty: true });
    } else if (runCodeIsEnabled) {
      setValue(AgentCapabilities.execute_code, false, { shouldDirty: true });
    } else {
      setIsDialogOpen(true);
    }
  };

  return (
    <>
      <HoverCard openDelay={50}>
        <div className="flex items-center">
          <Controller
            name={AgentCapabilities.execute_code}
            control={control}
            render={({ field }) => (
              <Checkbox
                {...field}
                id="execute-code-checkbox"
                checked={runCodeIsEnabled ? runCodeIsEnabled : isToolAuthenticated && field.value}
                onCheckedChange={handleCheckboxChange}
                className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={field.value.toString()}
                disabled={runCodeIsEnabled ? false : !isToolAuthenticated}
                aria-labelledby="execute-code-label"
              />
            )}
          />
          <label
            id="execute-code-label"
            htmlFor="execute-code-checkbox"
            className="form-check-label text-token-text-primary cursor-pointer"
          >
            {localize('com_ui_run_code')}
          </label>
          <div className="ml-2 flex gap-2">
            {isUserProvided && (
              <button
                ref={apiKeyButtonRef}
                type="button"
                onClick={() => setIsDialogOpen(true)}
                aria-label={localize('com_ui_add_code_interpreter_api_key')}
                aria-haspopup="dialog"
                aria-expanded={isDialogOpen}
              >
                <KeyRoundIcon className="h-5 w-5 text-text-primary" aria-hidden="true" />
              </button>
            )}
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center"
                aria-label={localize('com_agents_code_interpreter')}
              >
                <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
              </button>
            </HoverCardTrigger>
          </div>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  {localize('com_agents_code_interpreter')}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </div>
      </HoverCard>
      <ApiKeyDialog
        isOpen={isDialogOpen}
        onSubmit={onSubmit}
        onRevoke={handleRevokeApiKey}
        onOpenChange={setIsDialogOpen}
        register={keyFormMethods.register}
        isToolAuthenticated={isToolAuthenticated}
        handleSubmit={keyFormMethods.handleSubmit}
        isUserProvided={authType === AuthType.USER_PROVIDED}
        triggerRef={apiKeyButtonRef}
      />
    </>
  );
}
