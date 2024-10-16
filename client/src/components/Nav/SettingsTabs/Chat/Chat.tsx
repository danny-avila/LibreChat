import { memo } from 'react';
import FontSizeSelector from './FontSizeSelector';
import SendMessageKeyEnter from './EnterToSend';
import ShowCodeSwitch from './ShowCodeSwitch';
import { ForkSettings } from './ForkSettings';
import ChatDirection from './ChatDirection';
import LaTeXParsing from './LaTeXParsing';
import ModularChat from './ModularChat';
import SaveDraft from './SaveDraft';

function Chat() {
  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="border-b border-border-light pb-3 last-of-type:border-b-0">
        <FontSizeSelector />
      </div>
      <div className="border-b border-border-light pb-3 last-of-type:border-b-0">
        <ChatDirection />
      </div>
      <div className="border-b border-border-light pb-3 last-of-type:border-b-0">
        <SendMessageKeyEnter />
      </div>
      <div className="border-b border-border-light pb-3 last-of-type:border-b-0">
        <ShowCodeSwitch />
      </div>
      <div className="border-b border-border-light pb-3 last-of-type:border-b-0">
        <SaveDraft />
      </div>
      <ForkSettings />
      <div className="border-b border-border-light pb-3 last-of-type:border-b-0">
        <ModularChat />
      </div>
      <div className="border-b border-border-light pb-3 last-of-type:border-b-0">
        <LaTeXParsing />
      </div>
    </div>
  );
}

export default memo(Chat);
