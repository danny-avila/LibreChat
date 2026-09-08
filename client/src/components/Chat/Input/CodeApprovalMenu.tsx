import { ShieldCheck, ShieldAlert, Hand } from 'lucide-react';
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
import type { SetterOrUpdater } from 'recoil';
import { useCodeApprovalMode, useLocalize } from '~/hooks';

export default function CodeApprovalMenu({
  conversation,
  addedConversation,
  setConversation,
  disabled,
}: {
  conversation: TConversation | null;
  addedConversation?: TConversation | null;
  setConversation: SetterOrUpdater<TConversation | null>;
  disabled: boolean;
}) {
  const localize = useLocalize();
  const { available, modes, selected } = useCodeApprovalMode(conversation, addedConversation);

  if (!available || selected == null) {
    return null;
  }
  const labels: Record<CodeApprovalMode, string> = {
    ask: localize('com_ui_code_approval_ask'),
    acceptEdits: localize('com_ui_code_approval_accept_edits'),
    fullAccess: localize('com_ui_code_approval_full_access'),
  };
  const descriptions: Record<CodeApprovalMode, string> = {
    ask: localize('com_ui_code_approval_ask_description'),
    acceptEdits: localize('com_ui_code_approval_accept_edits_description'),
    fullAccess: localize('com_ui_code_approval_full_access_description'),
  };
  const ModeIcon = { ask: Hand, acceptEdits: ShieldCheck, fullAccess: ShieldAlert }[selected];

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
          <ModeIcon aria-hidden="true" />
          <span>{labels[selected]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        <DropdownMenuLabel>{localize('com_ui_code_approval_mode')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={selected}
          onValueChange={(value) => {
            if (!modes.includes(value as CodeApprovalMode)) return;
            setConversation((current) =>
              current == null
                ? current
                : { ...current, codeApprovalMode: value as CodeApprovalMode },
            );
          }}
        >
          {modes.map((mode) => (
            <DropdownMenuRadioItem key={mode} value={mode}>
              <div>
                <div>{labels[mode]}</div>
                <div className="text-xs text-text-tertiary">{descriptions[mode]}</div>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
