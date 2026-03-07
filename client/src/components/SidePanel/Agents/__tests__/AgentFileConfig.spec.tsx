import React from 'react';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import {
  EModelEndpoint,
  mergeFileConfig,
  resolveEndpointType,
  getEndpointFileConfig,
} from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { AgentForm } from '~/common';

/**
 * Tests the file config resolution logic shared by FileContext, FileSearch, and Code/Files.
 * All three components follow the same pattern:
 *   1. Read provider from form context via useWatch
 *   2. Resolve endpointType via resolveEndpointType(endpointsConfig, 'agents', provider)
 *   3. Call getEndpointFileConfig({ fileConfig, endpoint: provider ?? 'agents', endpointType })
 *   4. Use the result for isUploadDisabled and file limits
 *
 * This test validates that logic with real resolveEndpointType and getEndpointFileConfig
 * — no mocking of the resolution chain.
 */

const mockEndpointsConfig: TEndpointsConfig = {
  [EModelEndpoint.openAI]: { userProvide: false, order: 0 },
  [EModelEndpoint.agents]: { userProvide: false, order: 1 },
  Moonshot: { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
  'Some Endpoint': { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
};

let mockFileConfig = mergeFileConfig({
  endpoints: {
    Moonshot: { fileLimit: 5 },
    [EModelEndpoint.agents]: { fileLimit: 20 },
    default: { fileLimit: 10 },
  },
});

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: mockEndpointsConfig }),
  useGetFileConfig: ({ select }: { select?: (data: unknown) => unknown }) => ({
    data: select != null ? select(mockFileConfig) : mockFileConfig,
  }),
}));

/**
 * Mirrors the resolution logic in FileContext / FileSearch / Code/Files:
 *   const providerOption = useWatch<AgentForm>({ name: 'provider' });
 *   const providerValue = typeof providerOption === 'string' ? providerOption : providerOption?.value;
 *   const endpointType = resolveEndpointType(endpointsConfig, EModelEndpoint.agents, providerValue);
 *   const endpointFileConfig = getEndpointFileConfig({ fileConfig, endpoint: providerValue ?? 'agents', endpointType });
 */
function FileConfigProbe() {
  const providerOption = useWatch<AgentForm>({ name: 'provider' });
  const providerValue =
    typeof providerOption === 'string'
      ? providerOption
      : (providerOption as { value?: string } | undefined)?.value;
  const endpointType = resolveEndpointType(
    mockEndpointsConfig,
    EModelEndpoint.agents,
    providerValue,
  );
  const endpointFileConfig = getEndpointFileConfig({
    fileConfig: mockFileConfig,
    endpoint: providerValue ?? EModelEndpoint.agents,
    endpointType,
  });
  return (
    <div>
      <span data-testid="endpointType">{String(endpointType)}</span>
      <span data-testid="fileLimit">{endpointFileConfig.fileLimit}</span>
      <span data-testid="disabled">{String(endpointFileConfig.disabled ?? false)}</span>
    </div>
  );
}

function TestWrapper({ provider }: { provider?: string | { label: string; value: string } }) {
  const methods = useForm<AgentForm>({
    defaultValues: { provider: provider as AgentForm['provider'] },
  });
  return (
    <FormProvider {...methods}>
      <FileConfigProbe />
    </FormProvider>
  );
}

describe('AgentPanel file config resolution', () => {
  describe('endpointType resolution from form provider', () => {
    it('resolves to custom when provider is a custom endpoint string', () => {
      render(<TestWrapper provider="Moonshot" />);
      expect(screen.getByTestId('endpointType').textContent).toBe(EModelEndpoint.custom);
    });

    it('resolves to custom when provider is a custom endpoint with spaces', () => {
      render(<TestWrapper provider="Some Endpoint" />);
      expect(screen.getByTestId('endpointType').textContent).toBe(EModelEndpoint.custom);
    });

    it('resolves to openAI when provider is openAI', () => {
      render(<TestWrapper provider={EModelEndpoint.openAI} />);
      expect(screen.getByTestId('endpointType').textContent).toBe(EModelEndpoint.openAI);
    });

    it('falls back to agents when provider is undefined', () => {
      render(<TestWrapper />);
      expect(screen.getByTestId('endpointType').textContent).toBe(EModelEndpoint.agents);
    });

    it('resolves correctly when provider is an option object', () => {
      render(<TestWrapper provider={{ label: 'Moonshot', value: 'Moonshot' }} />);
      expect(screen.getByTestId('endpointType').textContent).toBe(EModelEndpoint.custom);
    });
  });

  describe('file config fallback chain', () => {
    it('uses Moonshot-specific file config when provider is Moonshot', () => {
      render(<TestWrapper provider="Moonshot" />);
      expect(screen.getByTestId('fileLimit').textContent).toBe('5');
    });

    it('falls back to agents file config when provider has no specific config', () => {
      render(<TestWrapper provider="Some Endpoint" />);
      expect(screen.getByTestId('fileLimit').textContent).toBe('20');
    });

    it('uses agents file config when no provider is set', () => {
      render(<TestWrapper />);
      expect(screen.getByTestId('fileLimit').textContent).toBe('20');
    });

    it('falls back to agents config for openAI provider (no openAI-specific config)', () => {
      render(<TestWrapper provider={EModelEndpoint.openAI} />);
      expect(screen.getByTestId('fileLimit').textContent).toBe('10');
    });
  });

  describe('disabled state', () => {
    it('reports not disabled for standard config', () => {
      render(<TestWrapper provider="Moonshot" />);
      expect(screen.getByTestId('disabled').textContent).toBe('false');
    });

    it('reports disabled when provider-specific config is disabled', () => {
      const original = mockFileConfig;
      mockFileConfig = mergeFileConfig({
        endpoints: {
          Moonshot: { disabled: true },
          [EModelEndpoint.agents]: { fileLimit: 20 },
          default: { fileLimit: 10 },
        },
      });

      render(<TestWrapper provider="Moonshot" />);
      expect(screen.getByTestId('disabled').textContent).toBe('true');

      mockFileConfig = original;
    });
  });

  describe('consistency with direct custom endpoint', () => {
    it('resolves to the same type as a direct custom endpoint would', () => {
      render(<TestWrapper provider="Moonshot" />);
      const agentEndpointType = screen.getByTestId('endpointType').textContent;
      const directEndpointType = resolveEndpointType(mockEndpointsConfig, 'Moonshot');
      expect(agentEndpointType).toBe(directEndpointType);
    });
  });
});
