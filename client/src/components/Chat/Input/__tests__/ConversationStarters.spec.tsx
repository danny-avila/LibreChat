import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConversationStarters from '../ConversationStarters';
import { Constants } from 'librechat-data-provider';

// Mock all external dependencies
jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
  useAgentsMapContext: jest.fn(),
  useAssistantsMapContext: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetAssistantDocsQuery: jest.fn(),
  useGetEndpointsQuery: jest.fn(),
}));

jest.mock('~/utils', () => ({
  getIconEndpoint: jest.fn(),
  getEntity: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useSubmitMessage: jest.fn(),
  useLocalize: jest.fn().mockImplementation(() => (key) => key),
}));

jest.mock('lucide-react', () => ({
  ZapIcon: () => <div data-testid="zap-icon" />,
}));

import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useGetAssistantDocsQuery, useGetEndpointsQuery } from '~/data-provider';
import { getIconEndpoint, getEntity } from '~/utils';
import { useSubmitMessage } from '~/hooks';

describe('ConversationStarters', () => {
  const mockSubmitMessage = jest.fn();

  beforeEach(() => {
    // Default mock implementations
    (useChatContext as jest.Mock).mockReturnValue({
      conversation: { endpoint: 'openAI', iconURL: '', agent_id: null, assistant_id: null },
    });
    (useAgentsMapContext as jest.Mock).mockReturnValue(new Map());
    (useAssistantsMapContext as jest.Mock).mockReturnValue(new Map());
    (useGetEndpointsQuery as jest.Mock).mockReturnValue({ data: {} });
    (useGetAssistantDocsQuery as jest.Mock).mockReturnValue({ data: new Map() });
    (getIconEndpoint as jest.Mock).mockReturnValue('openAI');
    (getEntity as jest.Mock).mockReturnValue({ entity: null, isAgent: false });
    (useSubmitMessage as jest.Mock).mockReturnValue({ submitMessage: mockSubmitMessage });

    // Suppress console.log in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render conversation starters when entity has conversation_starters', () => {
    const mockStarters = [
      'Conversation starter 1',
      'Conversation starter 2',
      'Conversation starter 3',
    ];

    (getEntity as jest.Mock).mockReturnValue({
      entity: { id: 'entity-1', conversation_starters: mockStarters },
      isAgent: false,
    });

    render(<ConversationStarters />);

    // Check for "Suggestions:" text
    expect(screen.getByText('com_ui_suggestions')).toBeInTheDocument();

    // Check for ZapIcon
    expect(screen.getByTestId('zap-icon')).toBeInTheDocument();

    // Check all conversation starters are rendered
    mockStarters.forEach((starter) => {
      expect(screen.getByText(starter)).toBeInTheDocument();
    });

    // Check number of buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(mockStarters.length);
  });

  it('should return null when there are no conversation starters', () => {
    (getEntity as jest.Mock).mockReturnValue({
      entity: { id: 'entity-1', conversation_starters: [] },
      isAgent: false,
    });

    const { container } = render(<ConversationStarters />);

    expect(container.firstChild).toBeNull();
  });

  it('should limit displayed conversation starters to MAX_CONVO_STARTERS', () => {
    const manyStarters = Array.from({ length: 10 }, (_, i) => `Starter ${i + 1}`);

    (getEntity as jest.Mock).mockReturnValue({
      entity: { id: 'entity-1', conversation_starters: manyStarters },
      isAgent: false,
    });

    render(<ConversationStarters />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(Constants.MAX_CONVO_STARTERS);

    // Check only first MAX_CONVO_STARTERS are displayed
    for (let i = 0; i < Constants.MAX_CONVO_STARTERS; i++) {
      expect(screen.getByText(`Starter ${i + 1}`)).toBeInTheDocument();
    }

    // Check that starters beyond the limit are not displayed
    for (let i: number = Constants.MAX_CONVO_STARTERS; i < manyStarters.length; i++) {
      expect(screen.queryByText(`Starter ${i + 1}`)).not.toBeInTheDocument();
    }
  });

  it('should get conversation starters from documentsMap when entity has no starters', () => {
    const mockStarters = ['Document starter 1', 'Document starter 2'];
    const mockDocumentsMap = new Map([
      ['assistant-1', { assistant_id: 'assistant-1', conversation_starters: mockStarters }],
    ]);

    (getEntity as jest.Mock).mockReturnValue({
      entity: { id: 'assistant-1', conversation_starters: undefined },
      isAgent: false,
    });

    (useGetAssistantDocsQuery as jest.Mock).mockReturnValue({ data: mockDocumentsMap });

    render(<ConversationStarters />);

    mockStarters.forEach((starter) => {
      expect(screen.getByText(starter)).toBeInTheDocument();
    });
  });

  it('should return empty array for agents (isAgent = true)', () => {
    (getEntity as jest.Mock).mockReturnValue({
      entity: { id: 'agent-1' },
      isAgent: true,
    });

    const { container } = render(<ConversationStarters />);

    expect(container.firstChild).toBeNull();
  });

  it('should render UI structure correctly', () => {
    const mockStarters = ['Starter 1'];

    (getEntity as jest.Mock).mockReturnValue({
      entity: { id: 'entity-1', conversation_starters: mockStarters },
      isAgent: false,
    });

    const { container } = render(<ConversationStarters />);

    // Check main container classes
    const mainContainer = container.querySelector('.mt-4.flex.flex-col.justify-center');
    expect(mainContainer).toBeInTheDocument();

    // Check suggestions header
    const suggestionsText = screen.getByText('com_ui_suggestions');
    expect(suggestionsText).toHaveClass('text-gray-400', 'text-[13px]', 'font-medium', 'pb-2');

    // Check button styling
    const button = screen.getByRole('button');
    expect(button).toHaveClass(
      'relative',
      'flex',
      'w-[48%]',
      'cursor-pointer',
      'rounded-2xl',
      'hover:bg-surface-tertiary',
    );
  });

  it('should handle entity with undefined conversation_starters', () => {
    (getEntity as jest.Mock).mockReturnValue({
      entity: { id: 'entity-1' },
      isAgent: false,
    });

    (useGetAssistantDocsQuery as jest.Mock).mockReturnValue({ data: new Map() });

    const { container } = render(<ConversationStarters />);

    expect(container.firstChild).toBeNull();
  });

  it('should handle null entity', () => {
    (getEntity as jest.Mock).mockReturnValue({
      entity: null,
      isAgent: false,
    });

    const { container } = render(<ConversationStarters />);

    expect(container.firstChild).toBeNull();
  });

  it('should call submitMessage with correct text when conversation starter is clicked', () => {
    const mockStarters = ['Test starter 1', 'Test starter 2'];

    (getEntity as jest.Mock).mockReturnValue({
      entity: { id: 'entity-1', conversation_starters: mockStarters },
      isAgent: false,
    });

    render(<ConversationStarters />);

    const secondButton = screen.getByText('Test starter 2').closest('button');
    expect(secondButton).toBeInTheDocument();

    // Simulate click on the first conversation starter button
    secondButton?.click();

    // Verify submitMessage was called with the correct text
    expect(mockSubmitMessage).toHaveBeenCalledTimes(1);
    expect(mockSubmitMessage).toHaveBeenCalledWith({ text: 'Test starter 2' });
  });
});
