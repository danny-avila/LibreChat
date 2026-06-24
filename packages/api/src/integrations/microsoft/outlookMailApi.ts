import type { GmailMessageSummary, GmailSearchResult } from '../googleMail/mailApi';

export type { GmailMessageSummary, GmailSearchResult };

export interface OutlookMailSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

const GRAPH_URL = 'https://graph.microsoft.com/v1.0';

type GraphEmailAddress = {
  name?: string;
  address?: string;
};

type GraphOutlookMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress?: GraphEmailAddress };
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  toRecipients?: Array<{ emailAddress?: GraphEmailAddress }>;
};

type GraphOutlookMessagesResponse = {
  value?: GraphOutlookMessage[];
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

function formatSender(from?: { emailAddress?: GraphEmailAddress }): string {
  const emailAddress = from?.emailAddress;
  if (!emailAddress) {
    return 'Unknown sender';
  }
  if (emailAddress.name && emailAddress.address) {
    return `${emailAddress.name} <${emailAddress.address}>`;
  }
  return emailAddress.address ?? emailAddress.name ?? 'Unknown sender';
}

function formatRecipients(recipients?: Array<{ emailAddress?: GraphEmailAddress }>): string {
  if (!recipients?.length) {
    return '';
  }
  return recipients
    .map((recipient) => {
      const emailAddress = recipient.emailAddress;
      if (!emailAddress) {
        return '';
      }
      if (emailAddress.name && emailAddress.address) {
        return `${emailAddress.name} <${emailAddress.address}>`;
      }
      return emailAddress.address ?? emailAddress.name ?? '';
    })
    .filter(Boolean)
    .join(', ');
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapOutlookMessage(message: GraphOutlookMessage): GmailMessageSummary {
  return {
    id: message.id,
    threadId: message.conversationId ?? message.id,
    subject: message.subject?.trim() || '(No subject)',
    from: formatSender(message.from),
    date: message.receivedDateTime ?? '',
    snippet: message.bodyPreview ?? '',
  };
}

async function graphRequest<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Microsoft Graph mail API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

function buildMessagesUrl(options: OutlookMailSearchOptions): string {
  if (options.pageToken) {
    return options.pageToken;
  }

  const pageSize = clampPageSize(options.pageSize);
  const params = new URLSearchParams({
    $top: String(pageSize),
    $orderby: 'receivedDateTime desc',
    $select: 'id,conversationId,subject,from,receivedDateTime,bodyPreview',
  });

  const query = options.query?.trim();
  if (query) {
    const escaped = query.replace(/'/g, "''");
    params.set('$filter', `contains(subject,'${escaped}') or contains(bodyPreview,'${escaped}')`);
  }

  return `${GRAPH_URL}/me/messages?${params.toString()}`;
}

export async function searchOutlookMailMessages(
  accessToken: string,
  options: OutlookMailSearchOptions = {},
): Promise<GmailSearchResult> {
  const payload = await graphRequest<GraphOutlookMessagesResponse>(
    accessToken,
    buildMessagesUrl(options),
  );

  return {
    messages: (payload.value ?? []).map(mapOutlookMessage),
    nextPageToken: payload['@odata.nextLink'],
  };
}

function extractMessageBody(message: GraphOutlookMessage): string {
  const content = message.body?.content ?? '';
  if (!content) {
    return message.bodyPreview ?? '';
  }
  if (message.body?.contentType?.toLowerCase() === 'html') {
    return stripHtml(content);
  }
  return content;
}

export async function getOutlookMailMessageAsText(
  accessToken: string,
  messageId: string,
): Promise<{ fileName: string; content: string }> {
  const params = new URLSearchParams({
    $select: 'id,subject,from,toRecipients,receivedDateTime,body,bodyPreview',
  });
  const message = await graphRequest<GraphOutlookMessage>(
    accessToken,
    `${GRAPH_URL}/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`,
  );

  const subject = message.subject?.trim() || '(No subject)';
  const from = formatSender(message.from);
  const to = formatRecipients(message.toRecipients);
  const date = message.receivedDateTime ?? '';
  const body = extractMessageBody(message);

  const content = [
    `Subject: ${subject}`,
    `From: ${from}`,
    to ? `To: ${to}` : '',
    date ? `Date: ${date}` : '',
    '',
    body || message.bodyPreview || '',
  ]
    .filter(Boolean)
    .join('\n');

  const safeSubject = sanitizeFileNameBase(subject);
  return {
    fileName: `${safeSubject || message.id}.txt`,
    content,
  };
}
