import React from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { cn, defaultTextProps, optionText } from '~/utils/';
import { Slider, InputNumber } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function AutoSendTextSelector() {
  const localize = useLocalize();

  const speechToText = useRecoilValue(store.speechToText);
  const [autoSendText, setAutoSendText] = useRecoilState(store.autoSendText);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center justify-between">
        <div>{localize('com_nav_auto_send_text')}</div>
        <div className="w-2" />
        <small className="opacity-40">({localize('com_nav_auto_send_text_disabled')})</small>
      </div>
      <div className="flex items-center justify-between">
        <Slider
          value={[autoSendText ?? -1]}
          onValueChange={(value) => setAutoSendText(value[0])}
          doubleClickHandler={() => setAutoSendText(-1)}
          min={-1}
          max={60}
          step={1}
          className="ml-4 flex h-4 w-24"
          disabled={!speechToText}
        />
        <div className="w-2" />
        <InputNumber
          value={`${autoSendText} s`}
          disabled={!speechToText}
          onChange={(value) => setAutoSendText(value ? value[0] : 0)}
          min={-1}
          max={60}
          className={cn(
            defaultTextProps,
            cn(
              optionText,
              'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
            ),
          )}
        />
      </div>
    </div>
  );
}
