import { useFormContext } from 'react-hook-form';
import { ArtifactModes, AgentCapabilities } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import {
  Switch,
  HoverCard,
  HoverCardPortal,
  HoverCardContent,
  HoverCardTrigger,
} from '~/components/ui';
import { useLocalize } from '~/hooks';
import { CircleHelpIcon } from '~/components/svg';
import { ESide } from '~/common';

export default function Artifacts() {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();
  const { setValue, watch } = methods;

  const artifactsMode = watch(AgentCapabilities.artifacts);

  const handleArtifactsChange = (value: boolean) => {
    setValue(AgentCapabilities.artifacts, value ? ArtifactModes.DEFAULT : '', {
      shouldDirty: true,
    });
  };

  const handleShadcnuiChange = (value: boolean) => {
    setValue(AgentCapabilities.artifacts, value ? ArtifactModes.SHADCNUI : ArtifactModes.DEFAULT, {
      shouldDirty: true,
    });
  };

  const handleCustomModeChange = (value: boolean) => {
    setValue(AgentCapabilities.artifacts, value ? ArtifactModes.CUSTOM : ArtifactModes.DEFAULT, {
      shouldDirty: true,
    });
  };

  const isEnabled = artifactsMode !== undefined && artifactsMode !== '';
  const isCustomEnabled = artifactsMode === ArtifactModes.CUSTOM;
  const isShadcnEnabled = artifactsMode === ArtifactModes.SHADCNUI;

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center gap-2">
        <span>
          <label className="text-token-text-primary block font-medium">
            {localize('com_ui_artifacts')}
          </label>
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <SwitchItem
          id="artifacts"
          label={localize('com_ui_artifacts_toggle_agent')}
          checked={isEnabled}
          onCheckedChange={handleArtifactsChange}
          hoverCardText={localize('com_nav_info_code_artifacts_agent')}
        />
        <SwitchItem
          id="includeShadcnui"
          label={localize('com_ui_include_shadcnui')}
          checked={isShadcnEnabled}
          onCheckedChange={handleShadcnuiChange}
          hoverCardText={localize('com_nav_info_include_shadcnui')}
          disabled={!isEnabled || isCustomEnabled}
        />
        <SwitchItem
          id="customPromptMode"
          label={localize('com_ui_custom_prompt_mode')}
          checked={isCustomEnabled}
          onCheckedChange={handleCustomModeChange}
          hoverCardText={localize('com_nav_info_custom_prompt_mode')}
          disabled={!isEnabled}
        />
      </div>
    </div>
  );
}

function SwitchItem({
  id,
  label,
  checked,
  onCheckedChange,
  hoverCardText,
  disabled = false,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  hoverCardText: string;
  disabled?: boolean;
}) {
  return (
    <HoverCard openDelay={50}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={disabled ? 'text-text-tertiary' : ''}>{label}</div>
          <HoverCardTrigger>
            <CircleHelpIcon className="h-4 w-4 text-text-tertiary" />
          </HoverCardTrigger>
        </div>
        <HoverCardPortal>
          <HoverCardContent side={ESide.Top} className="w-80">
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">{hoverCardText}</p>
            </div>
          </HoverCardContent>
        </HoverCardPortal>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="ml-4"
          data-testid={id}
          disabled={disabled}
        />
      </div>
    </HoverCard>
  );
}
