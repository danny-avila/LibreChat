import { useRecoilState } from 'recoil';
import HoverCardSettings from '~/components/Nav/SettingsTabs/HoverCardSettings';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function CodeArtifacts() {
  const localize = useLocalize();
  const [includeShadcnui, setIncludeShadcnui] = useRecoilState<boolean>(store.includeShadcnui);
  const [customPromptMode, setCustomPromptMode] = useRecoilState<boolean>(store.customPromptMode);

  const handleIncludeShadcnuiChange = (value: boolean) => {
    setIncludeShadcnui(value);
  };

  const handleCustomPromptModeChange = (value: boolean) => {
    setCustomPromptMode(value);
    if (value) {
      setIncludeShadcnui(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">{localize('com_ui_artifacts')}</h3>
      <div className="space-y-2">
        <SwitchItem
          id="includeShadcnui"
          label={localize('com_ui_include_shadcnui')}
          checked={includeShadcnui}
          onCheckedChange={handleIncludeShadcnuiChange}
          hoverCardText="com_nav_info_include_shadcnui"
          disabled={customPromptMode}
        />
        <SwitchItem
          id="customPromptMode"
          label={localize('com_ui_custom_prompt_mode')}
          checked={customPromptMode}
          onCheckedChange={handleCustomPromptModeChange}
          hoverCardText="com_nav_info_custom_prompt_mode"
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
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div className={disabled ? 'text-gray-400' : ''}>{label}</div>
        <HoverCardSettings side="bottom" text={hoverCardText} />
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="ml-4"
        data-testid={id}
        disabled={disabled}
      />
    </div>
  );
}
