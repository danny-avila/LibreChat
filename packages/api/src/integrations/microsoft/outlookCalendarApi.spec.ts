import {
  formatOutlookCalendarEventAsText,
  getOutlookCalendarEvent,
  listOutlookCalendarEvents,
} from './outlookCalendarApi';

describe('listOutlookCalendarEvents', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists upcoming Outlook calendar events', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        value: [
          {
            id: 'event-1',
            subject: 'Team sync',
            bodyPreview: 'Weekly standup',
            location: { displayName: 'Room A' },
            start: { dateTime: '2026-06-02T10:00:00Z' },
            end: { dateTime: '2026-06-02T11:00:00Z' },
            webLink: 'https://outlook.office.com/event-1',
          },
        ],
      }),
    } as unknown as Response);

    const result = await listOutlookCalendarEvents('token-123', { pageSize: 10 });

    expect(result.events).toEqual([
      {
        id: 'event-1',
        summary: 'Team sync',
        description: 'Weekly standup',
        location: 'Room A',
        start: '2026-06-02T10:00:00Z',
        end: '2026-06-02T11:00:00Z',
        htmlLink: 'https://outlook.office.com/event-1',
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://graph.microsoft.com/v1.0/me/calendarView'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-123' },
      }),
    );
  });
});

describe('getOutlookCalendarEvent', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches a single Outlook calendar event', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'event-1',
        subject: 'Demo',
        bodyPreview: 'Product demo',
        start: { dateTime: '2026-06-02T14:00:00Z' },
        end: { dateTime: '2026-06-02T15:00:00Z' },
      }),
    } as unknown as Response);

    const result = await getOutlookCalendarEvent('token-123', 'event-1');

    expect(result.summary).toBe('Demo');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/me/events/event-1'),
      expect.any(Object),
    );
  });
});

describe('formatOutlookCalendarEventAsText', () => {
  it('formats event details as plain text', () => {
    const formatted = formatOutlookCalendarEventAsText({
      id: 'event-1',
      summary: 'Demo',
      description: 'Product demo',
      location: 'Room B',
      start: '2026-06-02T14:00:00Z',
      end: '2026-06-02T15:00:00Z',
      htmlLink: 'https://outlook.office.com/event-1',
    });

    expect(formatted.fileName).toBe('Demo.txt');
    expect(formatted.content).toContain('Title: Demo');
    expect(formatted.content).toContain('Location: Room B');
  });
});
