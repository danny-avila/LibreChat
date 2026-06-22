export interface GoogleCalendarEventSummary {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  htmlLink?: string;
}

export interface GoogleCalendarListResult {
  events: GoogleCalendarEventSummary[];
  nextPageToken?: string;
}

export interface GoogleCalendarListOptions {
  query?: string;
  timeMin?: string;
  timeMax?: string;
  pageSize?: number;
  pageToken?: string;
}

const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

function formatEventDateTime(value?: { dateTime?: string; date?: string }): string | undefined {
  return value?.dateTime ?? value?.date;
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  options: GoogleCalendarListOptions = {},
): Promise<GoogleCalendarListResult> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 10, 1), 25);
  const params = new URLSearchParams({
    maxResults: String(pageSize),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  if (options.query?.trim()) {
    params.set('q', options.query.trim());
  }
  if (options.timeMin) {
    params.set('timeMin', options.timeMin);
  }
  if (options.timeMax) {
    params.set('timeMax', options.timeMax);
  }
  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }

  const response = await fetch(`${CALENDAR_EVENTS_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Calendar API error (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      description?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      htmlLink?: string;
    }>;
    nextPageToken?: string;
  };

  return {
    events: (payload.items ?? []).map((event) => mapCalendarEvent(event)),
    nextPageToken: payload.nextPageToken,
  };
}

function mapCalendarEvent(event: {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
}): GoogleCalendarEventSummary {
  return {
    id: event.id,
    summary: event.summary ?? '(No title)',
    description: event.description,
    location: event.location,
    start: formatEventDateTime(event.start),
    end: formatEventDateTime(event.end),
    htmlLink: event.htmlLink,
  };
}

export async function getGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<GoogleCalendarEventSummary> {
  const response = await fetch(`${CALENDAR_EVENTS_URL}/${encodeURIComponent(eventId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Calendar API error (${response.status}): ${body}`);
  }

  const event = (await response.json()) as {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    htmlLink?: string;
  };

  return mapCalendarEvent(event);
}

function sanitizeFileNameBase(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .slice(0, 80);
}

export function formatGoogleCalendarEventAsText(event: GoogleCalendarEventSummary): {
  fileName: string;
  content: string;
} {
  const content = [
    `Title: ${event.summary}`,
    event.start ? `Start: ${event.start}` : '',
    event.end ? `End: ${event.end}` : '',
    event.location ? `Location: ${event.location}` : '',
    event.htmlLink ? `Link: ${event.htmlLink}` : '',
    event.description ? `\n${event.description}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const safeTitle = sanitizeFileNameBase(event.summary);

  return {
    fileName: `${safeTitle || event.id}.txt`,
    content,
  };
}
