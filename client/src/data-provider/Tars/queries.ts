import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type {
  TTarsDomain,
  TTarsModelOptions,
  TTarsDomainsResponse,
  TTarsKnowledgeBase,
  TTarsDomainPrepareData,
} from 'librechat-data-provider';

const adminQueryOptions = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
} as const;

/**
 * Lists the pwc_tars specialized brains (專用腦) the authenticated user may
 * access. Returns [] for non-tars users or when the integration is unconfigured.
 */
export const useTarsDomainsQuery = (
  config?: UseQueryOptions<TTarsDomainsResponse, unknown, TTarsDomain[]>,
): QueryObserverResult<TTarsDomain[]> => {
  return useQuery<TTarsDomainsResponse, unknown, TTarsDomain[]>(
    [QueryKeys.tarsDomains],
    () => dataService.getTarsDomains(),
    {
      select: (data) => data.domains ?? [],
      ...adminQueryOptions,
      ...config,
    },
  );
};

/** Admin: all domains, knowledge bases and roles for the domain editor. */
export const useTarsDomainPrepareDataQuery = (
  config?: UseQueryOptions<TTarsDomainPrepareData>,
): QueryObserverResult<TTarsDomainPrepareData> => {
  return useQuery<TTarsDomainPrepareData>(
    [QueryKeys.tarsDomainPrepareData],
    () => dataService.getTarsDomainPrepareData(),
    { ...adminQueryOptions, ...config },
  );
};

/** Admin: knowledge bases with document/chunk/token stats. */
export const useTarsKnowledgeBasesQuery = (
  config?: UseQueryOptions<{ knowledgeBases: TTarsKnowledgeBase[] }, unknown, TTarsKnowledgeBase[]>,
): QueryObserverResult<TTarsKnowledgeBase[]> => {
  return useQuery<{ knowledgeBases: TTarsKnowledgeBase[] }, unknown, TTarsKnowledgeBase[]>(
    [QueryKeys.tarsKnowledgeBases],
    () => dataService.getTarsKnowledgeBases(),
    {
      select: (data) => data.knowledgeBases ?? [],
      ...adminQueryOptions,
      ...config,
    },
  );
};

/** Admin: LLM / embedding / rerank model options for the upload form. */
export const useTarsModelOptionsQuery = (
  config?: UseQueryOptions<TTarsModelOptions>,
): QueryObserverResult<TTarsModelOptions> => {
  return useQuery<TTarsModelOptions>(
    [QueryKeys.tarsModelOptions],
    () => dataService.getTarsKnowledgeBaseModels(),
    { ...adminQueryOptions, ...config },
  );
};
