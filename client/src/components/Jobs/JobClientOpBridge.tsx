import { memo } from 'react';
import { useJobClientOpBridge } from '~/hooks';

/** Headless bridge between waiting jobs and the connected local folder. */
function JobClientOpBridge() {
  useJobClientOpBridge();
  return null;
}

export default memo(JobClientOpBridge);
