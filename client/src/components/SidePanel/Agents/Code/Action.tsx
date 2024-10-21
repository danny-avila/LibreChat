import { useState } from 'react';
import { AgentCapabilities } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import type { AgentForm } from '~/common';
import {
  OGDialog,
  Checkbox,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { CircleHelpIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

export default function Action({ isToolAuthenticated = false }) {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { control, setValue, getValues } = methods;
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCheckboxChange = (checked: boolean) => {
    if (isToolAuthenticated) {
      setValue(AgentCapabilities.execute_code, checked, { shouldDirty: true });
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
                checked={field.value}
                onCheckedChange={handleCheckboxChange}
                className="relative float-left  mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={field.value.toString()}
              />
            )}
          />
          <button
            type="button"
            className="flex items-center space-x-2"
            onClick={() => handleCheckboxChange(!getValues(AgentCapabilities.execute_code))}
          >
            <label
              className="form-check-label text-token-text-primary w-full cursor-pointer"
              htmlFor={AgentCapabilities.execute_code}
            >
              {localize('com_agents_execute_code')}
            </label>
            <HoverCardTrigger>
              <CircleHelpIcon className="h-5 w-5 text-gray-500" />
            </HoverCardTrigger>
          </button>
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
          main={<></>}
          selection={{
            selectHandler: () => setIsDialogOpen(false),
            selectClasses: 'bg-green-500 hover:bg-green-600 text-white',
            selectText: localize('com_ui_save'),
          }}
          showCancelButton={false}
        />
      </OGDialog>
    </>
  );
}
