import { RecoilState, useRecoilState } from 'recoil';
import { Switch, InfoHoverCard, ESide } from '@librechat/client';
import { useLocalize } from '~/hooks';

type LocalizeFn = ReturnType<typeof useLocalize>;
type LocalizeKey = Parameters<LocalizeFn>[0];

interface ToggleSwitchProps {
  stateAtom: RecoilState<boolean>;
  localizationKey: LocalizeKey;
  hoverCardText?: LocalizeKey;
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
  const [switchState, setSwitchState] = useRecoilState(stateAtom);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setSwitchState(value);
    onCheckedChange?.(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div>{localize(localizationKey)}</div>
        {hoverCardText && <InfoHoverCard side={ESide.Bottom} text={localize(hoverCardText)} />}
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
