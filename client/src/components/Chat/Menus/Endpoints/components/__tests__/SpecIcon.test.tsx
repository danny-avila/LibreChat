import { render, screen } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import SpecIcon from '../SpecIcon';

jest.mock('~/hooks/Endpoint/Icons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const createIcon =
    (iconKey: string) =>
    ({ endpoint, iconURL }: { endpoint?: string | null; iconURL?: string }) =>
      React.createElement('span', {
        'data-testid': 'endpoint-icon',
        'data-icon-key': iconKey,
        'data-endpoint': endpoint ?? '',
        'data-icon-url': iconURL ?? '',
      });

  return {
    icons: {
      google: createIcon('google'),
      openAI: createIcon('openAI'),
      unknown: createIcon('unknown'),
    },
  };
});

jest.mock('~/components/Endpoints/URLIcon', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    URLIcon: ({ iconURL, endpoint }: { iconURL: string; endpoint?: string }) =>
      React.createElement('span', {
        'data-testid': 'url-icon',
        'data-icon-url': iconURL,
        'data-endpoint': endpoint ?? '',
      }),
  };
});

describe('SpecIcon', () => {
  const endpointsConfig = {} as TEndpointsConfig;

  it('renders the explicit spec icon when runtime spec data is missing preset', () => {
    const currentSpec = {
      name: 'gemini-test',
      label: 'Gemini Test',
      iconURL: EModelEndpoint.google,
    } as TModelSpec;

    render(<SpecIcon currentSpec={currentSpec} endpointsConfig={endpointsConfig} />);

    expect(screen.getByTestId('endpoint-icon')).toHaveAttribute(
      'data-icon-key',
      EModelEndpoint.google,
    );
    expect(screen.getByTestId('endpoint-icon')).toHaveAttribute('data-endpoint', '');
  });

  it('renders same-origin absolute spec icon URLs as images', () => {
    const currentSpec = {
      name: 'clickhouse-test',
      label: 'ClickHouse Test',
      iconURL: '/assets/clickhouse-logo.svg',
      preset: {
        endpoint: EModelEndpoint.anthropic,
      },
    } as TModelSpec;

    render(<SpecIcon currentSpec={currentSpec} endpointsConfig={endpointsConfig} />);

    expect(screen.getByTestId('url-icon')).toHaveAttribute(
      'data-icon-url',
      '/assets/clickhouse-logo.svg',
    );
    expect(screen.getByTestId('url-icon')).toHaveAttribute(
      'data-endpoint',
      EModelEndpoint.anthropic,
    );
  });

  it('falls back to the unknown icon when runtime spec data has no icon or preset', () => {
    const currentSpec = {
      name: 'gemini-test',
      label: 'Gemini Test',
    } as TModelSpec;

    render(<SpecIcon currentSpec={currentSpec} endpointsConfig={endpointsConfig} />);

    expect(screen.getByTestId('endpoint-icon')).toHaveAttribute('data-icon-key', 'unknown');
  });
});
