import '@testing-library/jest-dom';
import { ProviderId } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import { ProviderIcon } from './Icon';

describe('ProviderIcon', () => {
  it('renders component art with an accessible label', () => {
    render(<ProviderIcon provider={ProviderId.openai} />);
    expect(screen.getByRole('img', { name: 'OpenAI' })).toBeInTheDocument();
  });

  it('renders asset art as an image pointing at the registry path', () => {
    render(<ProviderIcon provider={ProviderId.ollama} />);
    expect(screen.getByRole('img', { name: 'Ollama' })).toHaveAttribute('src', 'assets/ollama.png');
  });

  it('gives monochrome art a theme token so it follows light and dark', () => {
    const { container } = render(<ProviderIcon provider={ProviderId.xai} />);
    expect(container.firstChild).toHaveClass('text-text-primary');
  });

  it('applies the registry layout correction', () => {
    const { container } = render(<ProviderIcon provider={ProviderId.cohere} />);
    expect(container.firstChild).toHaveClass('p-2');
  });

  it('applies the model refinement, so Gemini gets its own mark', () => {
    render(<ProviderIcon provider={ProviderId.google} model="gemini-2.5-pro" />);
    expect(screen.getByRole('img', { name: 'Gemini' })).toBeInTheDocument();
  });

  it('falls back to the generic mark for an unknown provider', () => {
    render(<ProviderIcon provider={null} />);
    expect(screen.getByRole('img', { name: 'Custom' })).toBeInTheDocument();
  });
});
