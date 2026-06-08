import { useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import type { PiiEvent } from '~/hooks/SSE/piiLabels';
import { formatPiiLabels } from '~/hooks/SSE/piiLabels';
import useLocalize from '~/hooks/useLocalize';

export type { PiiEvent, PiiPatternMatch } from '~/hooks/SSE/piiLabels';

export default function usePiiHandler() {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const piiMatchesHandler = useCallback(
    (data: PiiEvent) => {
      const labels = formatPiiLabels(data.matches);
      if (!labels) {
        return;
      }
      showToast({
        message: localize('com_ui_pii_redacted', { 0: labels }),
        status: 'info',
      });
    },
    [localize, showToast],
  );

  return { piiMatchesHandler };
}
