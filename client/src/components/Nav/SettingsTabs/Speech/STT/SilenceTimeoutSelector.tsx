import React from 'react';
import { useRecoilState } from 'recoil';
import { Slider, Label } from '@librechat/client';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function SilenceTimeoutSelector() {
  const localize = useLocalize();
  const [silenceTimeoutMs, setSilenceTimeoutMs] = useRecoilState<number>(store.silenceTimeoutMs);

  const handleChange = (value: number[]) => {
    setSilenceTimeoutMs(value[0]);
  };

  const formatTimeoutDisplay = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = ms / 1000;
    return seconds % 1 === 0 ? `${seconds}s` : `${seconds.toFixed(1)}s`;
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col">
        <Label htmlFor="silence-timeout-slider" className="text-left text-sm font-medium">
          {localize('com_nav_silence_timeout')}
        </Label>
        <div className="mt-1 text-xs text-text-secondary">
          Current: {formatTimeoutDisplay(silenceTimeoutMs)}
        </div>
      </div>
      <div className="flex w-1/2 items-center space-x-3">
        <div className="text-xs text-text-secondary">1s</div>
        <Slider
          id="silence-timeout-slider"
          min={1000}
          max={15000}
          step={500}
          value={[silenceTimeoutMs]}
          onValueChange={handleChange}
          className="flex-1"
          aria-label={localize('com_nav_silence_timeout')}
        />
        <div className="text-xs text-text-secondary">15s</div>
      </div>
    </div>
  );
}