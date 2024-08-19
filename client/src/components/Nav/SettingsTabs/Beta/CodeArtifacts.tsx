import { useRecoilState } from 'recoil';
import HoverCardSettings from '../HoverCardSettings';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function CodeArtifactsSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [codeArtifacts, setCodeArtifacts] = useRecoilState<boolean>(store.codeArtifacts);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setCodeArtifacts(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div>{localize('com_nav_code_artifacts')}</div>
        <HoverCardSettings side="bottom" text="com_nav_info_code_artifacts" />
      </div>
      <Switch
        id="codeArtifacts"
        checked={codeArtifacts}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="codeArtifacts"
      />
    </div>
  );
}
