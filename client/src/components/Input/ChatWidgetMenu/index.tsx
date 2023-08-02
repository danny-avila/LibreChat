import React from 'react';
import WritingAssistant from './WritingAssistant';
import { useRecoilState } from 'recoil';
import store from '~/store';
import { MessagesSquared } from '~/components/svg';
import EndpointOptionsPopover from '~/components/Endpoints/EndpointOptionsPopover';

function getWidget(type: string) {
  switch (type) {
    default: return WritingAssistant();
    case ('wa'): return WritingAssistant();
  }
}

export default function ChatWidget() {
  const [type, setType] = useRecoilState(store.widget);
  const widget = getWidget(type);

  return(
    <EndpointOptionsPopover
      content={
        <div className="px-4 py-4">
          { widget.content() }
        </div>
      }
      widget={true}
      visible={type !== ''}
      saveAsPreset={ widget.setTextHandler }
      switchToSimpleMode={() => {
        setType('');
      }}
      additionalButton={{
        label: (widget.showExample ? '恢复' : '示例'),
        handler: widget.showExampleHandler,
        icon: <MessagesSquared className="mr-1 w-[14px]" />
      }}
    />
  );
}
