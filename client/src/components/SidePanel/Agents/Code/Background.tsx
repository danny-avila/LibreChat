import { useCallback } from 'react';
import { Tools } from 'librechat-data-provider';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  Switch,
  HoverCard,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
  CircleHelpIcon,
} from '@librechat/client';
import type { AgentForm } from '~/common';
import { useAgentCapabilities, useGetAgentsConfig, useLocalize } from '~/hooks';
import { withBooleanOption } from '~/hooks/Agents/useMCPToolOptions';
import { ESide } from '~/common';

/** Tools sharing the code-execution sandbox; the single builder toggle opts
 *  the whole pair into background dispatch. */
const CODE_BACKGROUND_TOOL_IDS: string[] = [Tools.execute_code, Tools.bash_tool];

export default function Background() {
  const localize = useLocalize();
  const { agentsConfig } = useGetAgentsConfig();
  const { backgroundToolsEnabled } = useAgentCapabilities(agentsConfig?.capabilities);
  const { control, getValues, setValue } = useFormContext<AgentForm>();
  const toolOptions = useWatch({ control, name: 'tool_options' });
  /** Either key enables the pair at runtime (the backend expands the code
   *  opt-in across both), so the switch must reflect either. */
  const enabled = CODE_BACKGROUND_TOOL_IDS.some(
    (toolId) => toolOptions?.[toolId]?.run_in_background === true,
  );

  const handleChange = useCallback(
    (value: boolean) => {
      let updated = getValues('tool_options') || {};
      for (const toolId of CODE_BACKGROUND_TOOL_IDS) {
        updated = withBooleanOption(updated, toolId, 'run_in_background', value);
      }
      setValue('tool_options', updated, { shouldDirty: true });
    },
    [getValues, setValue],
  );

  if (!backgroundToolsEnabled) {
    return null;
  }

  return (
    <HoverCard openDelay={50}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="text-sm">{localize('com_ui_code_background')}</div>
          <HoverCardTrigger>
            <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
          </HoverCardTrigger>
        </div>
        <HoverCardPortal>
          <HoverCardContent side={ESide.Top} className="w-80">
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                {localize('com_nav_info_code_background')}
              </p>
            </div>
          </HoverCardContent>
        </HoverCardPortal>
        <Switch
          id="code-background-tools"
          checked={enabled}
          onCheckedChange={handleChange}
          className="ml-4"
          data-testid="code-background-tools"
          aria-label={localize('com_ui_code_background')}
        />
      </div>
    </HoverCard>
  );
}
