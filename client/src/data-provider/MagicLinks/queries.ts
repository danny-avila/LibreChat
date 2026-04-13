import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';

export const useGetMagicLinksQuery = () =>
  useQuery({
    queryKey: [QueryKeys.magicLinks],
    queryFn: () => dataService.getMagicLinks(),
  });
