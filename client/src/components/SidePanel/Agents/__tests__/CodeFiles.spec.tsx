import React from 'react';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { EModelEndpoint, mergeFileConfig } from 'librechat-data-provider';
import type { TEndpointsConfig } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import Files from '../Code/Files';

const mockEndpointsConfig: TEndpointsConfig = {
  [EModelEndpoint.agents]: { userProvide: false, order: 1 },
  Moonshot: { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
};

let mockFileConfig = mergeFileConfig({ endpoints: { default: { fileLimit: 10 } } });

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: mockEndpointsConfig }),
  useGetFileConfig: ({ select }: { select?: (d: unknown) => unknown }) => ({
    data: select != null ? select(mockFileConfig) : mockFileConfig,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useLazyEffect: () => {},
}));

jest.mock('~/hooks/Files/useFileHandling', () => ({
  useFileHandlingNoChatContext: () => ({
    abortUpload: jest.fn(),
    handleFileChange: jest.fn(),
  }),
}));

jest.mock('~/components/Chat/Input/Files/FileRow', () => () => null);

jest.mock('@librechat/client', () => ({
  AttachmentIcon: () => <span />,
}));

function Wrapper({ provider, children }: { provider?: string; children: React.ReactNode }) {
  const methods = useForm<AgentForm>({
    defaultValues: { provider: provider as AgentForm['provider'] },
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe('Code/Files', () => {
  it('renders upload UI when file uploads are not disabled', () => {
    mockFileConfig = mergeFileConfig({ endpoints: { default: { fileLimit: 10 } } });
    render(
      <Wrapper provider="Moonshot">
        <Files agent_id="agent-1" />
      </Wrapper>,
    );
    expect(screen.getByText('com_assistants_code_interpreter_files')).toBeInTheDocument();
  });

  it('returns null when file config is disabled for provider', () => {
    mockFileConfig = mergeFileConfig({
      endpoints: { Moonshot: { disabled: true }, default: { fileLimit: 10 } },
    });
    const { container } = render(
      <Wrapper provider="Moonshot">
        <Files agent_id="agent-1" />
      </Wrapper>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when agents endpoint config is disabled and no provider config', () => {
    mockFileConfig = mergeFileConfig({
      endpoints: { [EModelEndpoint.agents]: { disabled: true }, default: { fileLimit: 10 } },
    });
    const { container } = render(
      <Wrapper>
        <Files agent_id="agent-1" />
      </Wrapper>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders when provider has no specific config and agents config is enabled', () => {
    mockFileConfig = mergeFileConfig({
      endpoints: {
        [EModelEndpoint.agents]: { fileLimit: 20 },
        default: { fileLimit: 10 },
      },
    });
    render(
      <Wrapper provider="Moonshot">
        <Files agent_id="agent-1" />
      </Wrapper>,
    );
    expect(screen.getByText('com_assistants_code_interpreter_files')).toBeInTheDocument();
  });
});
