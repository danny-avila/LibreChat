import { KeyRoundIcon } from 'lucide-react';
import { AuthType, AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import {
  CircleHelpIcon,
  Checkbox,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from '@librechat/client';
import type { AgentForm } from '~/common';
import { useLocalize, useSearchApiKeyForm } from '~/hooks';
import ApiKeyDialog from './ApiKeyDialog';
import { ESide } from '~/common';

export default function Action({
  authTypes = [],
  isToolAuthenticated = false,
}: {
  authTypes?: [string, AuthType][];
  isToolAuthenticated?: boolean;
}) {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue, getValues } = methods;
  const {
    onSubmit,
    isDialogOpen,
    setIsDialogOpen,
    handleRevokeApiKey,
    methods: keyFormMethods,
  } = useSearchApiKeyForm({
    onSubmit: () => {
      setValue(AgentCapabilities.web_search, true, { shouldDirty: true });
    },
    onRevoke: () => {
      setValue(AgentCapabilities.web_search, false, { shouldDirty: true });
    },
  });

  const webSearchIsEnabled = useWatch({ control, name: AgentCapabilities.web_search });
  const isUserProvided = authTypes?.some(([, authType]) => authType === AuthType.USER_PROVIDED);

  const handleCheckboxChange = (checked: boolean) => {
    if (isToolAuthenticated) {
      setValue(AgentCapabilities.web_search, checked, { shouldDirty: true });
    } else if (webSearchIsEnabled) {
      setValue(AgentCapabilities.web_search, false, { shouldDirty: true });
    } else {
      setIsDialogOpen(true);
    }
  };

  return (
    <>
      <HoverCard openDelay={50}>
        <div className="flex items-center">
          <Controller
            name={AgentCapabilities.web_search}
            control={control}
            render={({ field }) => (
              <Checkbox
                {...field}
                checked={
                  webSearchIsEnabled ? webSearchIsEnabled : isToolAuthenticated && field.value
                }
                onCheckedChange={handleCheckboxChange}
                className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={field.value.toString()}
                disabled={webSearchIsEnabled ? false : !isToolAuthenticated}
                aria-label={localize('com_ui_web_search')}
              />
            )}
          />
          <button
            type="button"
            className="flex items-center space-x-2"
            onClick={() => {
              const value = !getValues(AgentCapabilities.web_search);
              handleCheckboxChange(value);
            }}
          >
            <label
              className="form-check-label text-token-text-primary w-full cursor-pointer"
              htmlFor={AgentCapabilities.web_search}
            >
              {localize('com_ui_web_search')}
            </label>
          </button>
          <div className="ml-2 flex gap-2">
            {isUserProvided && (isToolAuthenticated || webSearchIsEnabled) && (
              <button type="button" onClick={() => setIsDialogOpen(true)}>
                <KeyRoundIcon className="h-5 w-5 text-text-primary" />
              </button>
            )}
            <HoverCardTrigger>
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </HoverCardTrigger>
          </div>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">{localize('com_agents_search_info')}</p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </div>
      </HoverCard>
      <ApiKeyDialog
        onSubmit={onSubmit}
        authTypes={authTypes}
        isOpen={isDialogOpen}
        onRevoke={handleRevokeApiKey}
        onOpenChange={setIsDialogOpen}
        register={keyFormMethods.register}
        isToolAuthenticated={isToolAuthenticated}
        handleSubmit={keyFormMethods.handleSubmit}
      />
    </>
  );
}
