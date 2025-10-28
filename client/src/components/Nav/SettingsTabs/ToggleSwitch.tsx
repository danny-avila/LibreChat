import { RecoilState, useRecoilState } from 'recoil';
import { WritableAtom, useAtom } from 'jotai';
import { Switch, InfoHoverCard, ESide } from '@librechat/client';
import { useLocalize } from '~/hooks';

type LocalizeFn = ReturnType<typeof useLocalize>;
type LocalizeKey = Parameters<LocalizeFn>[0];

interface ToggleSwitchProps {
  stateAtom: RecoilState<boolean> | WritableAtom<boolean, [boolean], void>;
  localizationKey: LocalizeKey;
  hoverCardText?: LocalizeKey;
  switchId: string;
  onCheckedChange?: (value: boolean) => void;
  showSwitch?: boolean;
  disabled?: boolean;
  strongLabel?: boolean;
}

// Type guard to check if it's a Recoil atom
function isRecoilState<T>(atom: unknown): atom is RecoilState<T> {
  return atom != null && typeof atom === 'object' && 'key' in atom;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  stateAtom,
  localizationKey,
  hoverCardText,
  switchId,
  onCheckedChange,
  showSwitch = true,
  disabled = false,
  strongLabel = false,
}) => {
  const localize = useLocalize();

  const isRecoil = isRecoilState(stateAtom);

  const recoilHook = useRecoilState(
    isRecoil ? (stateAtom as RecoilState<boolean>) : ({} as RecoilState<boolean>),
  );
  const jotaiHook = useAtom(
    !isRecoil
      ? (stateAtom as WritableAtom<boolean, [boolean], void>)
      : ({} as WritableAtom<boolean, [boolean], void>),
  );

  const [switchState, setSwitchState] = isRecoil ? recoilHook : jotaiHook;

  const handleCheckedChange = (value: boolean) => {
    setSwitchState(value);
    onCheckedChange?.(value);
  };

  const labelId = `${switchId}-label`;

  if (!showSwitch) {
    return null;
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div id={labelId}>
          {strongLabel ? <strong>{localize(localizationKey)}</strong> : localize(localizationKey)}
        </div>
        {hoverCardText && <InfoHoverCard side={ESide.Bottom} text={localize(hoverCardText)} />}
      </div>
      <Switch
        id={switchId}
        checked={switchState}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid={switchId}
        aria-labelledby={labelId}
        disabled={disabled}
      />
    </div>
  );
};

export default ToggleSwitch;
