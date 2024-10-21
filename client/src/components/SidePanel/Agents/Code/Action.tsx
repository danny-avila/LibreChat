import { useState } from 'react';
import { KeyRoundIcon } from 'lucide-react';
import { useFormContext, Controller, useForm } from 'react-hook-form';
import { AuthType, AgentCapabilities } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import {
  Input,
  OGDialog,
  Checkbox,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
  Button,
} from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize, useAuthCodeTool } from '~/hooks';
import { CircleHelpIcon } from '~/components/svg';
import { ESide } from '~/common';

type ApiKeyFormData = {
  apiKey: string;
  authType?: string | AuthType;
};

export default function Action({ authType = '', isToolAuthenticated = false }) {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue, getValues } = methods;
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { installTool, removeTool } = useAuthCodeTool({ isEntityTool: true });

  const { reset, register, handleSubmit } = useForm<ApiKeyFormData>();
  const isUserProvided = authType === AuthType.USER_PROVIDED;

  const handleCheckboxChange = (checked: boolean) => {
    if (isToolAuthenticated) {
      setValue(AgentCapabilities.execute_code, checked, { shouldDirty: true });
    } else {
      setIsDialogOpen(true);
    }
  };

  const onSubmit = (data: { apiKey: string }) => {
    reset();
    installTool(data.apiKey);
    setIsDialogOpen(false);
  };

  const handleRevokeApiKey = () => {
    reset();
    removeTool();
    setIsDialogOpen(false);
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
                checked={isToolAuthenticated && field.value}
                onCheckedChange={handleCheckboxChange}
                className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={field.value.toString()}
                disabled={!isToolAuthenticated}
              />
            )}
          />
          <button
            type="button"
            className="flex items-center space-x-2"
            onClick={() => {
              if (isToolAuthenticated) {
                handleCheckboxChange(!getValues(AgentCapabilities.execute_code));
              } else {
                setIsDialogOpen(true);
              }
            }}
          >
            <label
              className="form-check-label text-token-text-primary w-full cursor-pointer"
              htmlFor={AgentCapabilities.execute_code}
            >
              {localize('com_agents_execute_code')}
            </label>
          </button>
          {isUserProvided && (
            <button type="button" className="mx-2" onClick={() => setIsDialogOpen(true)}>
              <KeyRoundIcon className="h-5 w-5 text-text-primary" />
            </button>
          )}
          <HoverCardTrigger>
            <CircleHelpIcon className="h-5 w-5 text-gray-500" />
          </HoverCardTrigger>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  {/* // TODO: add a Code Interpreter description */}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
        </div>
      </HoverCard>
      <OGDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <OGDialogTemplate
          className="w-11/12 sm:w-1/4"
          title={localize('com_agents_tool_not_authenticated')}
          main={
            <form onSubmit={handleSubmit(onSubmit)}>
              <Input
                type="password"
                placeholder="Enter API Key"
                autoComplete="one-time-code"
                readOnly={true}
                onFocus={(e) => (e.target.readOnly = false)}
                {...register('apiKey', { required: true })}
              />
            </form>
          }
          selection={{
            selectHandler: handleSubmit(onSubmit),
            selectClasses: 'bg-green-500 hover:bg-green-600 text-white',
            selectText: localize('com_ui_save'),
          }}
          buttons={
            isUserProvided && (
              <Button
                onClick={handleRevokeApiKey}
                className="bg-destructive text-white transition-all duration-200 hover:bg-destructive/80"
              >
                {localize('com_ui_revoke')}
              </Button>
            )
          }
          showCancelButton={true}
        />
      </OGDialog>
    </>
  );
}
