import type {
  GoogleCalendarEventSummary,
  GoogleCalendarListResult,
} from '../googleCalendar/calendarApi';

export type { GoogleCalendarEventSummary, GoogleCalendarListResult };

export interface OutlookCalendarListOptions {
  query?: string;
  timeMin?: string;
  timeMax?: string;
  pageSize?: number;
  pageToken?: string;
}

const GRAPH_URL = 'https://graph.microsoft.com/v1.0';

type GraphOutlookEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { content?: string };
  location?: { displayName?: string };
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  webLink?: string;
};

type GraphOutlookEventsResponse = {
  value?: GraphOutlookEvent[];
  '@odata.nextLink'?: string;
};

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(pageSize ?? 10, 1), 25);
}

function sanitizeFileNameBase(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .slice(0, 80);
}

function formatEventDateTime(value?: { dateTime?: string; date?: string }): string | undefined {
  return value?.dateTime ?? value?.date;
}

function mapOutlookEvent(event: GraphOutlookEvent): GoogleCalendarEventSummary {
  return {
    id: event.id,
    summary: event.subject?.trim() || '(No title)',
    description: event.bodyPreview ?? event.body?.content,
    location: event.location?.displayName,
    start: formatEventDateTime(event.start),
    end: formatEventDateTime(event.end),
    htmlLink: event.webLink,
  };
}

async function graphRequest<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Microsoft Graph calendar API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

function buildCalendarUrl(options: OutlookCalendarListOptions): string {
  if (options.pageToken) {
    return options.pageToken;
  }

  const pageSize = clampPageSize(options.pageSize);
  const params = new URLSearchParams({
    $top: String(pageSize),
    $orderby: 'start/dateTime',
    $select: 'id,subject,bodyPreview,location,start,end,webLink',
  });

  const timeMin = options.timeMin ?? new Date().toISOString();
  const timeMax = options.timeMax ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  params.set('startDateTime', timeMin);
  params.set('endDateTime', timeMax);

  const query = options.query?.trim();
  if (query) {
    const escaped = query.replace(/'/g, "''");
    params.set('$filter', `contains(subject,'${escaped}')`);
  }

  return `${GRAPH_URL}/me/calendarView?${params.toString()}`;
}

export async function listOutlookCalendarEvents(
  accessToken: string,
  options: OutlookCalendarListOptions = {},
): Promise<GoogleCalendarListResult> {
  const payload = await graphRequest<GraphOutlookEventsResponse>(
    accessToken,
    buildCalendarUrl(options),
  );

  return {
    events: (payload.value ?? []).map(mapOutlookEvent),
    nextPageToken: payload['@odata.nextLink'],
  };
}

export async function getOutlookCalendarEvent(
  accessToken: string,
  eventId: string,
): Promise<GoogleCalendarEventSummary> {
  const params = new URLSearchParams({
    $select: 'id,subject,bodyPreview,body,location,start,end,webLink',
  });
  const event = await graphRequest<GraphOutlookEvent>(
    accessToken,
    `${GRAPH_URL}/me/events/${encodeURIComponent(eventId)}?${params.toString()}`,
  );

  return mapOutlookEvent(event);
}

export function formatOutlookCalendarEventAsText(event: GoogleCalendarEventSummary): {
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
