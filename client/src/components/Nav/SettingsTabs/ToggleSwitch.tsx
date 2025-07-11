import { useAtom } from 'jotai';
import type { WritableAtom } from 'jotai';
import HoverCardSettings from './HoverCardSettings';
import useLocalize from '~/hooks/useLocalize';
import { Switch } from '~/components/ui';

interface ToggleSwitchProps {
  stateAtom: WritableAtom<boolean, [boolean], void>;
  localizationKey: string;
  hoverCardText?: string;
  switchId: string;
  onCheckedChange?: (value: boolean) => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  stateAtom,
  localizationKey,
  hoverCardText,
  switchId,
  onCheckedChange,
}) => {
  const [switchState, setSwitchState] = useAtom(stateAtom);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setSwitchState(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div>{localize(localizationKey as any)}</div>
        {hoverCardText && <HoverCardSettings side="bottom" text={hoverCardText} />}
      </div>
      <Switch
        id={switchId}
        checked={switchState}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid={switchId}
      />
    </div>
  );
};

export default ToggleSwitch;
