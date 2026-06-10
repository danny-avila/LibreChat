import { renderHook } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TStartupConfig, TEndpointsConfig } from 'librechat-data-provider';
import { useEndpoints } from '~/hooks/Endpoint/useEndpoints';
import { useGetEndpointsQuery } from '~/data-provider';
import { useHasAccess, useShowMarketplace } from '~/hooks';

jest.mock('librechat-data-provider/react-query', () => ({
  useGetModelsQuery: jest.fn().mockReturnValue({ data: {} }),
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useHasAccess: jest.fn(),
  useShowMarketplace: jest.fn(),
}));

const endpointsConfig = {} as TEndpointsConfig;
const startupConfig = { interface: { modelSelect: true } } as TStartupConfig;

const mockEndpoints = (endpoints: EModelEndpoint[]) =>
  (useGetEndpointsQuery as jest.Mock).mockReturnValue({ data: endpoints });

const runHook = () =>
  renderHook(() =>
    useEndpoints({ agents: null, assistantsMap: undefined, endpointsConfig, startupConfig }),
  );

describe('useEndpoints NJ customization', () => {
  it('never includes non-agents endpoints regardless of what the server returns', () => {
    (useHasAccess as jest.Mock).mockReturnValue(true);
    (useShowMarketplace as jest.Mock).mockReturnValue(true);
    mockEndpoints(Object.values(EModelEndpoint));
    const { result } = runHook();
    expect(result.current.mappedEndpoints).toHaveLength(1);
    expect(result.current.mappedEndpoints[0].value).toEqual(EModelEndpoint.agents);
  });

  it('returns empty array when agents endpoint is absent', () => {
    (useHasAccess as jest.Mock).mockReturnValue(true);
    (useShowMarketplace as jest.Mock).mockReturnValue(true);
    mockEndpoints([EModelEndpoint.openAI, EModelEndpoint.anthropic, EModelEndpoint.google]);
    const { result } = runHook();
    expect(result.current.mappedEndpoints).toHaveLength(0);
  });

  it('returns empty array when user lacks agents access', () => {
    (useHasAccess as jest.Mock).mockReturnValue(false);
    (useShowMarketplace as jest.Mock).mockReturnValue(true);
    mockEndpoints([EModelEndpoint.agents, EModelEndpoint.openAI]);
    const { result } = runHook();
    expect(result.current.mappedEndpoints).toHaveLength(0);
  });
});
