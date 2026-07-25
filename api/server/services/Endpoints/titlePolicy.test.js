const mockInspectContent = jest.fn();

jest.mock('@librechat/api', () => ({
  extractConversationTitleContent: ({ title }) => [
    { source: 'conversation_title', field: 'title', text: title },
  ],
  inspectContent: (...args) => mockInspectContent(...args),
}));

const { resolveConversationTitle } = require('./titlePolicy');

const filters = {
  conversationTitles: {
    pii: {
      starterPatterns: [],
      customPatterns: [{ id: 'blocked', label: 'blocked', regex: 'BLOCKED' }],
    },
  },
};

describe('resolveConversationTitle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInspectContent.mockReturnValue(null);
  });

  it('leaves titles untouched when the title source is disabled', () => {
    expect(resolveConversationTitle({ config: {} }, 'Original title')).toBe('Original title');
    expect(mockInspectContent).not.toHaveBeenCalled();
  });

  it('uses the fixed fallback when the candidate is blocked', () => {
    mockInspectContent.mockImplementation((fragments) =>
      fragments[0]?.text === 'BLOCKED-TITLE' ? { detectorId: 'pii-pattern' } : null,
    );

    expect(resolveConversationTitle({ config: { filters } }, 'BLOCKED-TITLE')).toBe('New Chat');
  });

  it('suppresses the write when both the candidate and fallback are blocked', () => {
    mockInspectContent.mockReturnValue({ detectorId: 'pii-pattern' });

    expect(resolveConversationTitle({ config: { filters } }, 'BLOCKED-TITLE')).toBeNull();
  });
});
