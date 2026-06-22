import { Controller, useFormContext } from 'react-hook-form';
import {
  Checkbox,
  CircleHelpIcon,
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from '@librechat/client';
import { Tools } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

export default function GoogleDriveForm() {
  const localize = useLocalize();
  const { control } = useFormContext<AgentForm>();

  return (
    <HoverCard openDelay={50}>
      <div className="flex items-center">
        <Controller
          name={Tools.google_drive}
          control={control}
          render={({ field }) => (
            <Checkbox
              {...field}
              id="google-drive-checkbox"
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
              value={String(field.value)}
              aria-labelledby="google-drive-label"
            />
          )}
        />
        <label
          id="google-drive-label"
          htmlFor="google-drive-checkbox"
          className="form-check-label text-token-text-primary cursor-pointer text-sm"
        >
          {localize('com_ui_google_drive')}
        </label>
        <HoverCardTrigger asChild className="ml-2">
          <button
            type="button"
            className="inline-flex items-center"
            aria-label={localize('com_agents_google_drive_info')}
          >
            <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
          </button>
        </HoverCardTrigger>
        <HoverCardPortal>
          <HoverCardContent side={ESide.Top} className="w-80">
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                {localize('com_agents_google_drive_info')}
              </p>
            </div>
          </HoverCardContent>
        </HoverCardPortal>
      </div>
    </HoverCard>
  );
}
