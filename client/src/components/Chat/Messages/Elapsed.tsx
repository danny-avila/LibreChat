import { memo, useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocalize } from '~/hooks';
import store from '~/store';

const elapsedSeconds = (start: number): number =>
  Math.max(0, Math.floor((Date.now() - start) / 1000));

/**
 * Elapsed generation time under the actively streaming response, in the footer
 * slot the hover actions occupy once the answer lands. The once-per-second tick
 * is component-local state, so parents that re-render per streaming token never
 * re-render on its account.
 */
const Elapsed = memo(function Elapsed({ index }: { index: number }) {
  const localize = useLocalize();
  const submissionStart = useRecoilValue(store.submissionStartFamily(index));
  const [mountTime] = useState(() => Date.now());
  const start = submissionStart ?? mountTime;
  const [seconds, setSeconds] = useState(() => elapsedSeconds(start));

  useEffect(() => {
    setSeconds(elapsedSeconds(start));
    const intervalId = setInterval(() => setSeconds(elapsedSeconds(start)), 1000);
    return () => clearInterval(intervalId);
  }, [start]);

  const minutes = Math.floor(seconds / 60);
  return (
    <span
      data-testid="stream-elapsed"
      className="flex items-center tabular-nums text-text-secondary"
    >
      {minutes > 0
        ? localize('com_ui_elapsed_minutes_seconds', { minutes, seconds: seconds % 60 })
        : localize('com_ui_elapsed_seconds', { seconds })}
    </span>
  );
});

export default Elapsed;
