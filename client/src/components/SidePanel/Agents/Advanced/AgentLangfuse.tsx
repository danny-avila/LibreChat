import { useCallback, useMemo, useState } from 'react';
import { Activity, Eye, EyeOff } from 'lucide-react';
import { Input, Label, Switch } from '@librechat/client';
import type { ControllerRenderProps } from 'react-hook-form';
import type { AgentForm } from '~/common';
import { useLocalize } from '~/hooks';

interface AgentLangfuseProps {
  field: ControllerRenderProps<AgentForm, 'langfuse'>;
}

const fieldDefaults = {
  enabled: false,
  publicKey: '',
  secretKey: '',
  baseUrl: '',
};

export default function AgentLangfuse({ field }: AgentLangfuseProps) {
  const localize = useLocalize();
  const [showSecret, setShowSecret] = useState(false);
  const value = useMemo(() => ({ ...fieldDefaults, ...(field.value ?? {}) }), [field.value]);
  const enabled = value.enabled === true;

  const updateField = useCallback(
    (key: keyof typeof fieldDefaults, next: string | boolean) => {
      field.onChange({
        ...value,
        [key]: next,
      });
    },
    [field, value],
  );

  const enableId = 'agent-langfuse-enable-toggle';

  return (
    <div className="rounded-md border border-border-light bg-surface-primary p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-secondary text-text-secondary">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <Label htmlFor={enableId} className="font-semibold text-text-primary">
              {localize('com_ui_agent_langfuse')}
            </Label>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              {localize('com_ui_agent_langfuse_info')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-border-light px-2 py-0.5 text-xs font-medium text-text-secondary">
            {localize(enabled ? 'com_ui_agent_langfuse_enabled' : 'com_ui_agent_langfuse_disabled')}
          </span>
          <Switch
            id={enableId}
            checked={enabled}
            onCheckedChange={(next) => updateField('enabled', next)}
            aria-label={localize('com_ui_agent_langfuse_enable')}
          />
        </div>
      </div>

      {enabled && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="agent-langfuse-public-key" className="text-xs font-medium">
              {localize('com_ui_agent_langfuse_public_key')}
            </Label>
            <Input
              id="agent-langfuse-public-key"
              value={value.publicKey}
              onChange={(event) => updateField('publicKey', event.target.value)}
              placeholder={localize('com_ui_agent_langfuse_public_key_placeholder')}
              autoComplete="off"
              className="bg-surface-secondary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-langfuse-secret-key" className="text-xs font-medium">
              {localize('com_ui_agent_langfuse_secret_key')}
            </Label>
            <div className="relative">
              <Input
                id="agent-langfuse-secret-key"
                type={showSecret ? 'text' : 'password'}
                value={value.secretKey}
                onChange={(event) => updateField('secretKey', event.target.value)}
                placeholder={localize('com_ui_agent_langfuse_secret_key_placeholder')}
                autoComplete="new-password"
                className="bg-surface-secondary pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary transition-colors hover:text-text-primary"
                aria-label={localize(showSecret ? 'com_ui_hide_password' : 'com_ui_show_password')}
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-langfuse-base-url" className="text-xs font-medium">
              {localize('com_ui_agent_langfuse_base_url')}
            </Label>
            <Input
              id="agent-langfuse-base-url"
              value={value.baseUrl}
              onChange={(event) => updateField('baseUrl', event.target.value)}
              placeholder={localize('com_ui_agent_langfuse_base_url_placeholder')}
              autoComplete="off"
              className="bg-surface-secondary"
            />
          </div>

          <a
            href="https://langfuse.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {localize('com_ui_agent_langfuse_docs')}
          </a>
        </div>
      )}
    </div>
  );
}
