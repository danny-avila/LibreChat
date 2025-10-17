import AgentSettings from '../AgentSettings';
import { useSetIndexOptions } from '~/hooks';
import { useChatContext } from '~/Providers';
import Settings from '../Plugins';

export default function PluginsView({ conversation, models, isPreset = false }) {
  const { showAgentSettings } = useChatContext();
  const { setOption, setTools, setAgentOption, checkPluginSelection } = useSetIndexOptions(
    isPreset ? conversation : null,
  );
  if (!conversation) {
    return null;
  }

  return showAgentSettings ? (
    <AgentSettings conversation={conversation} setOption={setAgentOption} models={models} />
  ) : (
    <Settings
      conversation={conversation}
      setOption={setOption}
      setTools={setTools}
      checkPluginSelection={checkPluginSelection}
      models={models}
    />
  );
}
