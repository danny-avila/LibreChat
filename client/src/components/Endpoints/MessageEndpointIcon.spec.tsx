import { render } from '@testing-library/react';
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
});
