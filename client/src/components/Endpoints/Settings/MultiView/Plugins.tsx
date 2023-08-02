import Settings from '../Plugins';
import AgentSettings from '../AgentSettings';
import { useSetOptions } from '~/hooks';
import { useRecoilValue } from 'recoil';
import store from '~/store';

export default function PluginsView({ conversation, models, isPreset = false }) {
  const showAgentSettings = useRecoilValue(store.showAgentSettings);
  const { setOption, setAgentOption } = useSetOptions(isPreset ? conversation : null);
  if (!conversation) {
    return null;
  }

  return showAgentSettings ? (
    <AgentSettings conversation={conversation} setOption={setAgentOption} models={models} />
  ) : (
    <Settings conversation={conversation} setOption={setOption} models={models} />
  );
}
