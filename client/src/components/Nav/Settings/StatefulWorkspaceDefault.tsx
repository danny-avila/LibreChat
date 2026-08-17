import { useEffect, useState } from 'react';
import {
  Select,
  SelectItem,
  SelectValue,
  SelectContent,
  SelectTrigger,
  useToastContext,
} from '@librechat/client';

import type { StatefulCodeEnvironment } from 'librechat-data-provider';
import { useGetUserQuery, useUpdateUserPreferencesMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

const FALLBACK_ENVIRONMENT: StatefulCodeEnvironment = 'user';

export default function StatefulWorkspaceDefault() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: user } = useGetUserQuery();
  const savedEnvironment = user?.personalization?.statefulCodeEnvironment ?? FALLBACK_ENVIRONMENT;
  const [environment, setEnvironment] = useState<StatefulCodeEnvironment>(savedEnvironment);

  useEffect(() => {
    setEnvironment(savedEnvironment);
  }, [savedEnvironment]);

  const mutation = useUpdateUserPreferencesMutation({
    onSuccess: () =>
      showToast({ message: localize('com_ui_preferences_updated'), status: 'success' }),
    onError: () => {
      setEnvironment(savedEnvironment);
      showToast({ message: localize('com_ui_error_updating_preferences'), status: 'error' });
    },
  });

  const handleChange = (value: string) => {
    const statefulCodeEnvironment = value as StatefulCodeEnvironment;
    setEnvironment(statefulCodeEnvironment);
    mutation.mutate({ statefulCodeEnvironment });
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <label id="default-stateful-workspace-label" htmlFor="default-stateful-workspace">
          {localize('com_ui_default_stateful_workspace')}
        </label>
        <p id="default-stateful-workspace-description" className="mt-1 text-xs text-text-secondary">
          {localize('com_ui_default_stateful_workspace_description')}
        </p>
      </div>
      <Select value={environment} onValueChange={handleChange} disabled={mutation.isLoading}>
        <SelectTrigger
          id="default-stateful-workspace"
          className="w-full shrink-0 sm:w-[220px]"
          aria-labelledby="default-stateful-workspace-label"
          aria-describedby="default-stateful-workspace-description"
          data-testid="default-stateful-workspace"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user">{localize('com_ui_stateful_code_environment_user')}</SelectItem>
          <SelectItem value="agent-user">
            {localize('com_ui_stateful_code_environment_agent_user')}
          </SelectItem>
          <SelectItem value="conversation">
            {localize('com_ui_stateful_code_environment_conversation')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
