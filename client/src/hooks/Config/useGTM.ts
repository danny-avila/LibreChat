import { useEffect } from 'react';
import TagManager from 'react-gtm-module';

export default function useGTM(gtmId?: string) {
  useEffect(() => {
    if (gtmId == null || typeof window.google_tag_manager !== 'undefined') {
      return;
    }

    TagManager.initialize({ gtmId });
  }, [gtmId]);
}
