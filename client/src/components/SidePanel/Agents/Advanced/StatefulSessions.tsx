import { useFormContext } from 'react-hook-form';
import { AgentCapabilities } from 'librechat-data-provider';
import {
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  HoverCard,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
  CircleHelpIcon,
} from '@librechat/client';
import type { StatefulCodeEnvironment } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

export default function StatefulSessions() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { setValue, watch } = methods;

  const enabled = watch(AgentCapabilities.stateful_code_sessions) ?? false;
  const codeEnabled = watch(AgentCapabilities.execute_code);
  const environment = watch('stateful_code_environment') ?? 'user';

  const handleChange = (value: boolean) => {
    setValue(AgentCapabilities.stateful_code_sessions, value, { shouldDirty: true });
    if (value && !watch('stateful_code_environment')) {
      setValue('stateful_code_environment', 'user', { shouldDirty: true });
    }
  };

  return (
    <div className="space-y-3">
      <HoverCard openDelay={50}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={codeEnabled ? 'text-sm' : 'text-sm text-text-tertiary'}>
              {localize('com_ui_stateful_sessions')}
            </div>
            <HoverCardTrigger>
              <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
            </HoverCardTrigger>
          </div>
          <HoverCardPortal>
            <HoverCardContent side={ESide.Top} className="w-80">
              <div className="space-y-2">
                <p className="text-sm text-text-secondary">
                  {localize('com_nav_info_stateful_sessions')}
                </p>
              </div>
            </HoverCardContent>
          </HoverCardPortal>
          <Switch
            id="stateful-code-sessions"
            checked={enabled && codeEnabled === true}
            onCheckedChange={handleChange}
            className="ml-4"
            data-testid="stateful-code-sessions"
            disabled={codeEnabled !== true}
            aria-label={localize('com_ui_stateful_sessions')}
          />
        </div>
      </HoverCard>
      {enabled && codeEnabled === true && (
        <div className="space-y-2 pl-1">
          <label
            className="text-xs font-medium text-text-secondary"
            htmlFor="stateful-code-environment"
          >
            {localize('com_ui_stateful_code_environment')}
          </label>
          <Select
            value={environment}
            onValueChange={(value) =>
              setValue('stateful_code_environment', value as StatefulCodeEnvironment, {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger id="stateful-code-environment" data-testid="stateful-code-environment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">
                {localize('com_ui_stateful_code_environment_user')}
              </SelectItem>
              <SelectItem value="agent-user">
                {localize('com_ui_stateful_code_environment_agent_user')}
              </SelectItem>
              <SelectItem value="conversation">
                {localize('com_ui_stateful_code_environment_conversation')}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-text-tertiary">
            {localize('com_nav_info_stateful_code_environment')}
          </p>
        </div>
      )}
    </div>
  );
}
