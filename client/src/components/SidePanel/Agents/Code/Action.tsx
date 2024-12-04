import { KeyRoundIcon } from 'lucide-react';
import { AuthType, AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import type { AgentForm } from '~/common';
import {
  Checkbox,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from '~/components/ui';
import { useLocalize, useCodeApiKeyForm } from '~/hooks';
import { CircleHelpIcon } from '~/components/svg';
import ApiKeyDialog from './ApiKeyDialog';
import { ESide } from '~/common';

export default function Action({ authType = '', isToolAuthenticated = false }) {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue, getValues } = methods;
  const {
    onSubmit,
    isDialogOpen,
    setIsDialogOpen,
    handleRevokeApiKey,
    methods: keyFormMethods,
  } = useCodeApiKeyForm({
    onSubmit: () => {
      setValue(AgentCapabilities.execute_code, true, { shouldDirty: true });
    },
    onRevoke: () => {
      setValue(AgentCapabilities.execute_code, false, { shouldDirty: true });
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
                checked={runCodeIsEnabled ? runCodeIsEnabled : isToolAuthenticated && field.value}
                onCheckedChange={handleCheckboxChange}
                className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={field.value.toString()}
                disabled={runCodeIsEnabled ? false : !isToolAuthenticated}
              />
            )}
          />
          <button
            type="button"
            className="flex items-center space-x-2"
            onClick={() => {
              const value = !getValues(AgentCapabilities.execute_code);
              handleCheckboxChange(value);
            }}
          >
            <label
              className="form-check-label text-token-text-primary w-full cursor-pointer"
              htmlFor={AgentCapabilities.execute_code}
            >
              {localize('com_ui_run_code')}
            </label>
          </button>
          <div className="ml-2 flex gap-2">
            {isUserProvided && (isToolAuthenticated || runCodeIsEnabled) && (
              <button type="button" onClick={() => setIsDialogOpen(true)}>
                <KeyRoundIcon className="h-5 w-5 text-text-primary" />
              </button>
            )}
            <HoverCardTrigger>
              <CircleHelpIcon className="h-5 w-5 text-gray-500" />
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
      />
    </>
  );
}
