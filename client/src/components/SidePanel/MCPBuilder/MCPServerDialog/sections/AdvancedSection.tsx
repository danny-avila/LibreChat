import { useMemo } from 'react';
import { useFormContext, Controller, useWatch } from 'react-hook-form';
import { Checkbox, Label, Radio, Textarea } from '@librechat/client';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';
import { useLocalize } from '~/hooks';

export default function AdvancedSection() {
  const localize = useLocalize();
  const { control, register } = useFormContext<MCPServerFormData>();

  const serverInstructionsMode =
    useWatch<MCPServerFormData, 'serverInstructionsMode'>({
      control,
      name: 'serverInstructionsMode',
    }) ?? 'none';

  const instructionOptions = useMemo(
    () => [
      { value: 'none', label: localize('com_ui_mcp_server_instructions_none') },
      { value: 'server', label: localize('com_ui_mcp_server_instructions_server') },
      { value: 'custom', label: localize('com_ui_mcp_server_instructions_custom') },
    ],
    [localize],
  );

  return (
    <div className="space-y-3">
      {/* Chat Menu */}
      <div className="flex items-start gap-3">
        <Controller
          name="chatMenu"
          control={control}
          render={({ field }) => (
            <Checkbox
              id="chat-menu"
              checked={field.value}
              onCheckedChange={field.onChange}
              aria-labelledby="chat-menu-label"
              aria-describedby="chat-menu-description"
              className="mt-0.5"
            />
          )}
        />
        <Label htmlFor="chat-menu" className="flex cursor-pointer flex-col gap-0.5">
          <span id="chat-menu-label" className="text-sm font-medium text-text-primary">
            {localize('com_ui_mcp_chat_menu')}
          </span>
          <span id="chat-menu-description" className="text-xs font-normal text-text-secondary">
            {localize('com_ui_mcp_chat_menu_description')}
          </span>
        </Label>
      </div>

      {/* Server Instructions */}
      <div className="space-y-1.5">
        <Label id="server-instructions-label" className="text-sm font-medium">
          {localize('com_ui_mcp_server_instructions')}
        </Label>
        <p id="server-instructions-description" className="text-xs text-text-secondary">
          {localize('com_ui_mcp_server_instructions_description')}
        </p>
        <Controller
          name="serverInstructionsMode"
          control={control}
          render={({ field }) => (
            <Radio
              options={instructionOptions}
              value={field.value}
              onChange={field.onChange}
              fullWidth
              aria-labelledby="server-instructions-label"
            />
          )}
        />
        {serverInstructionsMode === 'custom' && (
          <Textarea
            placeholder={localize('com_ui_mcp_server_instructions_custom_placeholder')}
            aria-label={localize('com_ui_mcp_server_instructions_custom_label')}
            {...register('serverInstructionsCustom')}
            className="mt-1 text-sm"
          />
        )}
      </div>
    </div>
  );
}
