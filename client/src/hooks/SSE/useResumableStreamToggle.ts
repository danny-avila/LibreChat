import { useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { EModelEndpoint } from 'librechat-data-provider';
import store from '~/store';

/**
 * Automatically toggles resumable streams off for assistants endpoints
 * and restores the previous value when switching away.
 *
 * Assistants endpoints have their own streaming mechanism and don't support resumable streams.
 */
export default function useResumableStreamToggle(
  endpoint: EModelEndpoint | string | null | undefined,
  endpointType?: EModelEndpoint | string | null,
) {
  const [resumableStreams, setResumableStreams] = useRecoilState(store.resumableStreams);
  const savedValueRef = useRef<boolean | null>(null);
  const wasAssistantsRef = useRef(false);

  useEffect(() => {
    const actualEndpoint = endpointType ?? endpoint;
    const isAssistants = isAssistantsEndpoint(actualEndpoint);

    if (isAssistants && !wasAssistantsRef.current) {
      // Switching TO assistants: save current value and disable
      savedValueRef.current = resumableStreams;
      if (resumableStreams) {
        setResumableStreams(false);
      }
      wasAssistantsRef.current = true;
    } else if (!isAssistants && wasAssistantsRef.current) {
      // Switching AWAY from assistants: restore saved value
      if (savedValueRef.current !== null) {
        setResumableStreams(savedValueRef.current);
        savedValueRef.current = null;
      }
      wasAssistantsRef.current = false;
    }
  }, [endpoint, endpointType, resumableStreams, setResumableStreams]);
}
