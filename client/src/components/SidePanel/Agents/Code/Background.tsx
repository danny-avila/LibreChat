import { Tools } from 'librechat-data-provider';
import Background from '../Background';

/** Tools sharing the code-execution sandbox; the single builder toggle opts
 *  the whole pair into background dispatch. */
const CODE_BACKGROUND_TOOL_IDS: string[] = [Tools.execute_code, Tools.bash_tool];

export default function CodeBackground() {
  return (
    <Background
      toolIds={CODE_BACKGROUND_TOOL_IDS}
      switchId="code-background-tools"
      labelKey="com_ui_code_background"
      infoKey="com_nav_info_code_background"
    />
  );
}
