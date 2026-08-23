import { render, screen } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import MessageEndpointIcon from './MessageEndpointIcon';

describe('MessageEndpointIcon', () => {
  it('uses the semantic foreground when an endpoint icon has no background', () => {
    const { container } = render(
      <MessageEndpointIcon
        endpoint={EModelEndpoint.custom}
        model="custom-model"
        isCreatedByUser={false}
      />,
    );

    expect(container.firstElementChild).toHaveClass('text-text-primary');
    expect(container.firstElementChild).not.toHaveClass('text-white');
  });

  it('keeps a contrasting foreground when an endpoint icon has a colored background', () => {
    const { container } = render(
      <MessageEndpointIcon
        endpoint={EModelEndpoint.openAI}
        model="gpt-4"
        isCreatedByUser={false}
      />,
    );

    expect(container.firstElementChild).toHaveClass('text-white');
    expect(container.firstElementChild).not.toHaveClass('text-text-primary');
  });

  it('renders the Gemini mark for a Gemini model', () => {
    render(
      <MessageEndpointIcon
        endpoint={EModelEndpoint.google}
        model="gemini-2.5-pro"
        size={30}
        isCreatedByUser={false}
      />,
    );

    expect(screen.getByTitle('Gemini')).toBeInTheDocument();
  });

  it('renders the Google mark for a non-Gemini Google model', () => {
    render(
      <MessageEndpointIcon
        endpoint={EModelEndpoint.google}
        model="text-bison"
        size={30}
        isCreatedByUser={false}
      />,
    );

    expect(screen.getByTitle('Google')).toBeInTheDocument();
  });

  it('paints the modern OpenAI tile black', () => {
    const { container } = render(
      <MessageEndpointIcon
        endpoint={EModelEndpoint.openAI}
        model="gpt-5.6"
        size={30}
        isCreatedByUser={false}
      />,
    );

    expect(container.querySelector('[title="OpenAI"]')).toHaveStyle({ background: '#000000' });
  });

  it('marks the tile when the message errored', () => {
    const { container } = render(
      <MessageEndpointIcon
        endpoint={EModelEndpoint.openAI}
        model="gpt-4"
        size={30}
        error={true}
        isCreatedByUser={false}
      />,
    );

    const badge = container.querySelector('[title="OpenAI"] > .bg-status-error');
    expect(badge).toHaveTextContent('!');
  });

  it('keeps a configured endpoint image instead of the generic mark', () => {
    render(
      <MessageEndpointIcon
        endpoint="My Gateway"
        iconURL="https://cdn.example.com/logo.png"
        model="some-model"
        size={30}
        isCreatedByUser={false}
      />,
    );

    expect(screen.getByAltText('My Gateway Icon')).toHaveAttribute(
      'src',
      'https://cdn.example.com/logo.png',
    );
  });
});
