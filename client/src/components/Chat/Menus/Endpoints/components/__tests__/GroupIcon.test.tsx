import { render, screen } from '@testing-library/react';
import GroupIcon from '../GroupIcon';

jest.mock('~/hooks/Endpoint/Icons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const createIcon =
    (iconKey: string) =>
    ({ className, endpoint }: { className?: string; endpoint?: string | null }) =>
      React.createElement('span', {
        className,
        'data-testid': 'endpoint-icon',
        'data-icon-key': iconKey,
        'data-endpoint': endpoint ?? '',
      });

  return {
    icons: {
      openAI: createIcon('openAI'),
      unknown: createIcon('unknown'),
    },
  };
});

describe('GroupIcon', () => {
  it('renders built-in endpoint icon keys', () => {
    render(<GroupIcon iconURL="openAI" groupName="OpenAI" />);

    expect(screen.getByTestId('endpoint-icon')).toHaveAttribute('data-icon-key', 'openAI');
  });

  it('resolves known endpoint asset aliases case-insensitively', () => {
    render(<GroupIcon iconURL="OpenRouter" groupName="OpenRouter" />);

    expect(screen.getByRole('img', { name: 'OpenRouter' })).toHaveAttribute(
      'src',
      'assets/openrouter.png',
    );
  });

  it('resolves known endpoint asset aliases to shipped file paths', () => {
    render(<GroupIcon iconURL="Helicone" groupName="Helicone" />);

    expect(screen.getByRole('img', { name: 'Helicone' })).toHaveAttribute(
      'src',
      'assets/helicone.svg',
    );
  });

  it('renders known endpoint aliases backed by components', () => {
    render(<GroupIcon iconURL="Moonshot" groupName="Moonshot" />);

    expect(screen.getByTestId('endpoint-icon')).toHaveAttribute('data-icon-key', 'unknown');
    expect(screen.getByTestId('endpoint-icon')).toHaveAttribute('data-endpoint', 'Moonshot');
  });

  it('renders configured image URLs directly', () => {
    render(<GroupIcon iconURL="/assets/openrouter.png" groupName="OpenRouter" />);

    expect(screen.getByRole('img', { name: 'OpenRouter' })).toHaveAttribute(
      'src',
      '/assets/openrouter.png',
    );
  });
});
