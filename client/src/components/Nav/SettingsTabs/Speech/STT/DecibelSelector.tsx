import React from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Slider, InputNumber } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn, defaultTextProps, optionText } from '~/utils/';

export default function DecibelSelector() {
  const localize = useLocalize();
  const speechToText = useRecoilValue(store.speechToText);
  const [decibelValue, setDecibelValue] = useRecoilState(store.decibelValue);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center justify-between">
        <div>{localize('com_nav_db_sensitivity')}</div>
        <div className="w-2" />
        <small className="opacity-40">({localize('com_endpoint_default_with_num', '-45')})</small>
      </div>
      <div className="flex items-center justify-between">
        <Slider
          value={[decibelValue ?? -45]}
          onValueChange={(value) => setDecibelValue(value[0])}
          onDoubleClick={() => setDecibelValue(-45)}
          min={-100}
          max={-30}
          step={1}
          className="ml-4 flex h-4 w-24"
          disabled={!speechToText}
        />
        <div className="w-2" />
        <InputNumber
          value={decibelValue}
          disabled={!speechToText}
          onChange={(value) => setDecibelValue(value ? value[0] : 0)}
          min={-100}
          max={-30}
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
