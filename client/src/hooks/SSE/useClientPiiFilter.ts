import { useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { redactSensitiveText } from '~/utils/piiRedact';
import { formatPiiLabels } from '~/hooks/SSE/piiLabels';
import { useGetStartupConfig } from '~/data-provider';
import useLocalize from '~/hooks/useLocalize';

export type ClientPiiApplyResult = {
  /** Text to send downstream. Equal to the input when no patterns matched. */
  text: string;
  /** When true, the caller should NOT proceed with submission (block mode). */
  blocked: boolean;
};

/**
 * Client-side prefilter that runs in the chat submit handler before
 * `text` ever leaves the browser. Defense in depth: the server still
 * pre-redacts on receipt for callers that bypass the UI (curl, custom
 * clients). When both fire on the same prompt the server side will
 * find no matches in the already-redacted text and stay silent, so no
 * duplicate toast.
 */
export default function useClientPiiFilter() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: startupConfig } = useGetStartupConfig();

  const apply = useCallback(
    (text: string): ClientPiiApplyResult => {
      const config = startupConfig?.messagePiiFilter;
      if (!config || !text) {
        return { text, blocked: false };
      }

      const { text: redacted, matches } = redactSensitiveText(text, config);
      if (matches.length === 0) {
        return { text, blocked: false };
      }

      const labels = formatPiiLabels(matches);

      if (config.onMatch === 'block') {
        if (labels) {
          showToast({
            message: localize('com_ui_pii_blocked', { 0: labels }),
            status: 'error',
          });
        }
        return { text, blocked: true };
      }

      if (config.onMatch === 'warn' && labels) {
        showToast({
          message: localize('com_ui_pii_redacted', { 0: labels }),
          status: 'warning',
        });
      }

      return { text: redacted, blocked: false };
    },
    [localize, showToast, startupConfig],
  );

  return { apply };
}
