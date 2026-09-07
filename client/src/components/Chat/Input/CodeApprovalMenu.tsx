import { ShieldCheck, Hand } from 'lucide-react';
import { EModelEndpoint, getAllowedCodeApprovalModes } from 'librechat-data-provider';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@librechat/client';
import type { CodeApprovalMode, TConversation } from 'librechat-data-provider';
import type { ConvoGenerator } from '~/common';
import { useGetAgentsConfig, useAgentToolPermissions, useLocalize } from '~/hooks';

export default function CodeApprovalMenu({
  conversation,
  newConversation,
  disabled,
}: {
  conversation: TConversation | null;
  newConversation: ConvoGenerator;
  disabled: boolean;
}) {
  const localize = useLocalize();
  const { agentsConfig } = useGetAgentsConfig();
  const { codeAllowedByAgent, codeEnvironmentId } = useAgentToolPermissions(conversation?.agent_id);
  const environments = agentsConfig?.statefulCodeSessions?.environments ?? [];
  const environment = codeEnvironmentId
    ? environments.find((candidate) => candidate.id === codeEnvironmentId)
    : environments.find((candidate) => candidate.default === true);

  if (
    (conversation?.endpointType ?? conversation?.endpoint) !== EModelEndpoint.agents ||
    !codeAllowedByAgent ||
    agentsConfig?.statefulCodeSessions?.approvalsEnabled === false ||
    environment?.type !== 'attached'
  ) {
    return null;
  }

  const modes = getAllowedCodeApprovalModes({
    environment: 'attached',
    allowedModes: ['ask', 'acceptEdits'],
    configSchema: environment.configSchema,
    settings: environment.settings,
  });
  const selected = modes.includes(conversation?.codeApprovalMode ?? 'ask')
    ? (conversation?.codeApprovalMode ?? 'ask')
    : 'ask';
  const labels: Record<CodeApprovalMode, string> = {
    ask: localize('com_ui_code_approval_ask'),
    acceptEdits: localize('com_ui_code_approval_accept_edits'),
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={localize('com_ui_code_approval_mode')}
          className="h-8 gap-1.5 rounded-full px-2 text-text-secondary"
          data-testid="code-approval-mode"
        >
          {selected === 'ask' ? <Hand aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          <span>{labels[selected]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        <DropdownMenuLabel>{localize('com_ui_code_approval_mode')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={selected}
          onValueChange={(value) => {
            if (!modes.includes(value as CodeApprovalMode)) return;
            newConversation({
              template: { ...conversation, codeApprovalMode: value as CodeApprovalMode },
            });
          }}
        >
          {modes.map((mode) => (
            <DropdownMenuRadioItem key={mode} value={mode}>
              <div>
                <div>{labels[mode]}</div>
                <div className="text-xs text-text-tertiary">
                  {localize(
                    mode === 'ask'
                      ? 'com_ui_code_approval_ask_description'
                      : 'com_ui_code_approval_accept_edits_description',
                  )}
                </div>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
