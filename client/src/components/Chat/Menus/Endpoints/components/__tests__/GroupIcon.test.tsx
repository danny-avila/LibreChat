import { render, screen } from '@testing-library/react';
import GroupIcon from '../GroupIcon';

describe('GroupIcon', () => {
  it('renders built-in endpoint icon keys', () => {
    render(<GroupIcon iconURL="openAI" groupName="OpenAI" />);

    expect(screen.getByRole('img', { name: 'OpenAI' })).toBeInTheDocument();
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

    expect(screen.getByRole('img', { name: 'Moonshot' })).toBeInTheDocument();
  });

  it('renders configured image URLs directly', () => {
    render(<GroupIcon iconURL="/assets/openrouter.png" groupName="OpenRouter" />);

    expect(screen.getByRole('img', { name: 'OpenRouter' })).toHaveAttribute(
      'src',
      '/assets/openrouter.png',
    );
  });
});
