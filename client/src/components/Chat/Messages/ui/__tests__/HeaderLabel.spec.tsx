import { render, screen } from '@testing-library/react';
import HeaderLabel, { getHeaderModelName } from '../HeaderLabel';

describe('getHeaderModelName', () => {
  it('prefers a real model over an agent document id', () => {
    expect(getHeaderModelName('agent_abc', 'gemma4:12b-it-qat')).toBe('gemma4:12b-it-qat');
  });

  it('returns nothing when only an agent id is available', () => {
    expect(getHeaderModelName('agent_abc')).toBeUndefined();
  });
});

describe('HeaderLabel', () => {
  it('renders only the provider when there is no model to show', () => {
    render(<HeaderLabel label="Ollama" />);

    expect(screen.getByText('Ollama')).toBeVisible();
    expect(screen.queryByText('gemma4:12b-it-qat')).not.toBeInTheDocument();
  });

  it('keeps the model in the slot for a hover swap', () => {
    render(<HeaderLabel label="Ollama" hoverLabel="gemma4:12b-it-qat" />);

    expect(screen.getByText('Ollama')).toBeVisible();
    expect(screen.getByText('gemma4:12b-it-qat')).toHaveAttribute('aria-hidden', 'true');
  });
});
