import { memo } from 'react';
import { showThinkingAtom } from '~/store/showThinking';
import FontSizeSelector from './FontSizeSelector';
import { ForkSettings } from './ForkSettings';
import ChatDirection from './ChatDirection';
import ToggleSwitch from '../ToggleSwitch';
import store from '~/store';

const toggleSwitchConfigs = [
  {
    stateAtom: store.enterToSend,
    localizationKey: 'com_nav_enter_to_send' as const,
    switchId: 'enterToSend',
    hoverCardText: 'com_nav_info_enter_to_send' as const,
    key: 'enterToSend',
  },
  {
    stateAtom: store.maximizeChatSpace,
    localizationKey: 'com_nav_maximize_chat_space' as const,
    switchId: 'maximizeChatSpace',
    hoverCardText: undefined,
    key: 'maximizeChatSpace',
  },
  {
    stateAtom: store.centerFormOnLanding,
    localizationKey: 'com_nav_center_chat_input' as const,
    switchId: 'centerFormOnLanding',
    hoverCardText: undefined,
    key: 'centerFormOnLanding',
  },
  {
    stateAtom: showThinkingAtom,
    localizationKey: 'com_nav_show_thinking' as const,
    switchId: 'showThinking',
    hoverCardText: undefined,
    key: 'showThinking',
  },
  {
    stateAtom: store.showCode,
    localizationKey: 'com_nav_show_code' as const,
    switchId: 'showCode',
    hoverCardText: undefined,
    key: 'showCode',
  },
  {
    stateAtom: store.LaTeXParsing,
    localizationKey: 'com_nav_latex_parsing' as const,
    switchId: 'latexParsing',
    hoverCardText: 'com_nav_info_latex_parsing' as const,
    key: 'latexParsing',
  },
  {
    stateAtom: store.saveDrafts,
    localizationKey: 'com_nav_save_drafts' as const,
    switchId: 'saveDrafts',
    hoverCardText: 'com_nav_info_save_draft' as const,
    key: 'saveDrafts',
  },
  {
    stateAtom: store.showScrollButton,
    localizationKey: 'com_nav_scroll_button' as const,
    switchId: 'showScrollButton',
    hoverCardText: undefined,
    key: 'showScrollButton',
  },
  {
    stateAtom: store.saveBadgesState,
    localizationKey: 'com_nav_save_badges_state' as const,
    switchId: 'showBadges',
    hoverCardText: 'com_nav_info_save_badges_state' as const,
    key: 'showBadges',
  },
  {
    stateAtom: store.modularChat,
    localizationKey: 'com_nav_modular_chat' as const,
    switchId: 'modularChat',
    hoverCardText: undefined,
    key: 'modularChat',
  },
  {
    stateAtom: store.defaultTemporaryChat,
    localizationKey: 'com_nav_default_temporary_chat' as const,
    switchId: 'defaultTemporaryChat',
    hoverCardText: 'com_nav_info_default_temporary_chat' as const,
    key: 'defaultTemporaryChat',
  },
];

function Chat() {
  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="pb-3">
        <FontSizeSelector />
      </div>
      <div className="pb-3">
        <ChatDirection />
      </div>
      {toggleSwitchConfigs.map((config) => (
        <div key={config.key} className="pb-3">
          <ToggleSwitch
            stateAtom={config.stateAtom}
            localizationKey={config.localizationKey}
            hoverCardText={config.hoverCardText}
            switchId={config.switchId}
          />
        </div>
      ))}
      <ForkSettings />
    </div>
  );
}

export default memo(Chat);
