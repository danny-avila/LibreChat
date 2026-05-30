import React from 'react';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { EModelEndpoint, mergeFileConfig, resolveEndpointType } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import useAgentFileConfig from '~/hooks/Agents/useAgentFileConfig';

/**
 * Tests the useAgentFileConfig hook used by FileContext, FileSearch, and Code/Files.
 * Uses the real hook with mocked data-fetching layer.
 */

const mockEndpointsConfig: TEndpointsConfig = {
  [EModelEndpoint.openAI]: { userProvide: false, order: 0 },
  [EModelEndpoint.agents]: { userProvide: false, order: 1 },
  Moonshot: { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
  'Some Endpoint': { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
};

const defaultFileConfig = mergeFileConfig({
  endpoints: {
    Moonshot: { fileLimit: 5 },
    [EModelEndpoint.agents]: { fileLimit: 20 },
    default: { fileLimit: 10 },
  },
});

let mockFileConfig = defaultFileConfig;

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: mockEndpointsConfig }),
  useGetFileConfig: ({ select }: { select?: (data: unknown) => unknown }) => ({
    data: select != null ? select(mockFileConfig) : mockFileConfig,
  }),
}));

function FileConfigProbe() {
  const { endpointType, endpointFileConfig } = useAgentFileConfig();
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

describe('AgentPanel file config resolution (useAgentFileConfig)', () => {
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

    it('falls back to agents when provider is empty string', () => {
      render(<TestWrapper provider="" />);
      expect(screen.getByTestId('endpointType').textContent).toBe(EModelEndpoint.agents);
      expect(screen.getByTestId('fileLimit').textContent).toBe('20');
    });

    it('falls back to agents when provider option has empty value', () => {
      render(<TestWrapper provider={{ label: '', value: '' }} />);
      expect(screen.getByTestId('endpointType').textContent).toBe(EModelEndpoint.agents);
      expect(screen.getByTestId('fileLimit').textContent).toBe('20');
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

    it('falls back to default config for openAI provider (no openAI-specific config)', () => {
      render(<TestWrapper provider={EModelEndpoint.openAI} />);
      expect(screen.getByTestId('fileLimit').textContent).toBe('10');
    });
  });

  describe('disabled state', () => {
    beforeEach(() => {
      mockFileConfig = defaultFileConfig;
    });

    it('reports not disabled for standard config', () => {
      render(<TestWrapper provider="Moonshot" />);
      expect(screen.getByTestId('disabled').textContent).toBe('false');
    });

    it('reports disabled when provider-specific config is disabled', () => {
      mockFileConfig = mergeFileConfig({
        endpoints: {
          Moonshot: { disabled: true },
          [EModelEndpoint.agents]: { fileLimit: 20 },
          default: { fileLimit: 10 },
        },
      });

      render(<TestWrapper provider="Moonshot" />);
      expect(screen.getByTestId('disabled').textContent).toBe('true');
    });

    it('reports disabled when agents config is disabled and no provider set', () => {
      mockFileConfig = mergeFileConfig({
        endpoints: {
          [EModelEndpoint.agents]: { disabled: true },
          default: { fileLimit: 10 },
        },
      });

      render(<TestWrapper />);
      expect(screen.getByTestId('disabled').textContent).toBe('true');
    });

    it('reports disabled when agents is disabled and provider has no specific config', () => {
      mockFileConfig = mergeFileConfig({
        endpoints: {
          [EModelEndpoint.agents]: { disabled: true },
          default: { fileLimit: 10 },
        },
      });

      render(<TestWrapper provider="Some Endpoint" />);
      expect(screen.getByTestId('disabled').textContent).toBe('true');
    });

    it('provider-specific enabled overrides agents disabled', () => {
      mockFileConfig = mergeFileConfig({
        endpoints: {
          Moonshot: { disabled: false, fileLimit: 5 },
          [EModelEndpoint.agents]: { disabled: true },
          default: { fileLimit: 10 },
        },
      });

      render(<TestWrapper provider="Moonshot" />);
      expect(screen.getByTestId('disabled').textContent).toBe('false');
      expect(screen.getByTestId('fileLimit').textContent).toBe('5');
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
