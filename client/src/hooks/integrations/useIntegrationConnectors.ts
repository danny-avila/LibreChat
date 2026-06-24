import { useMemo } from 'react';
import type { IntegrationProviderKey } from 'librechat-data-provider';
import { useNangoConnect } from './useNangoConnect';

export type IntegrationConnector = ReturnType<typeof useNangoConnect>;

export type IntegrationConnectorsMap = Partial<
  Record<IntegrationProviderKey, IntegrationConnector>
>;

export function useIntegrationConnectors(enabled: boolean): IntegrationConnectorsMap {
  const googleDrive = useNangoConnect({ providerKey: 'google-drive', enabled });
  const googleMail = useNangoConnect({ providerKey: 'google-mail', enabled });
  const googleCalendar = useNangoConnect({ providerKey: 'google-calendar', enabled });
  const microsoft = useNangoConnect({ providerKey: 'microsoft', enabled });
  const dropbox = useNangoConnect({ providerKey: 'dropbox', enabled });
  const box = useNangoConnect({ providerKey: 'box', enabled });
  const clio = useNangoConnect({ providerKey: 'clio', enabled });

  return useMemo(
    () => ({
      'google-drive': googleDrive,
      'google-mail': googleMail,
      'google-calendar': googleCalendar,
      microsoft,
      dropbox,
      box,
      clio,
    }),
    [googleDrive, googleMail, googleCalendar, microsoft, dropbox, box, clio],
  );
}
