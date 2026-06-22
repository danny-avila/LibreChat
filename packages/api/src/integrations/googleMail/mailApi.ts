export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface GmailSearchResult {
  messages: GmailMessageSummary[];
  nextPageToken?: string;
}

export interface GmailSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

const GMAIL_API_ROOT = 'https://gmail.googleapis.com/gmail/v1/users/me';

function getHeaderValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string,
): string {
  const header = headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase());
  return header?.value?.trim() ?? '';
}

export async function searchGmailMessages(
  accessToken: string,
  options: GmailSearchOptions = {},
): Promise<GmailSearchResult> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 10, 1), 25);
  const params = new URLSearchParams({
    maxResults: String(pageSize),
  });

  if (options.query?.trim()) {
    params.set('q', options.query.trim());
  }
  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }

  const listResponse = await fetch(`${GMAIL_API_ROOT}/messages?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!listResponse.ok) {
    const body = await listResponse.text();
    throw new Error(`Gmail API error (${listResponse.status}): ${body}`);
  }

  const listPayload = (await listResponse.json()) as {
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
  };

  const messageRefs = listPayload.messages ?? [];
  const messages = await Promise.all(
    messageRefs.map(async (messageRef) => {
      const detailResponse = await fetch(
        `${GMAIL_API_ROOT}/messages/${messageRef.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!detailResponse.ok) {
        const body = await detailResponse.text();
        throw new Error(`Gmail API error (${detailResponse.status}): ${body}`);
      }

      const detail = (await detailResponse.json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        payload?: { headers?: Array<{ name?: string; value?: string }> };
      };

      return {
        id: detail.id,
        threadId: detail.threadId,
        subject: getHeaderValue(detail.payload?.headers, 'Subject') || '(No subject)',
        from: getHeaderValue(detail.payload?.headers, 'From') || 'Unknown sender',
        date: getHeaderValue(detail.payload?.headers, 'Date') || '',
        snippet: detail.snippet ?? '',
      };
    }),
  );

  return {
    messages,
    nextPageToken: listPayload.nextPageToken,
  };
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function extractMessageBody(payload: {
  mimeType?: string;
  body?: { data?: string };
  parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
}): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const parts = payload.parts ?? [];
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
  }

  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
  }

  for (const part of parts) {
    if (part.parts?.length) {
      const nested = extractMessageBody(part as typeof payload);
      if (nested) {
        return nested;
      }
    }
  }

  return '';
}

function sanitizeFileNameBase(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .slice(0, 80);
}

export async function getGmailMessageAsText(
  accessToken: string,
  messageId: string,
): Promise<{ fileName: string; content: string }> {
  const response = await fetch(`${GMAIL_API_ROOT}/messages/${messageId}?format=full`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${body}`);
  }

  const message = (await response.json()) as {
    id: string;
    snippet?: string;
    payload?: {
      headers?: Array<{ name?: string; value?: string }>;
      mimeType?: string;
      body?: { data?: string };
      parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
    };
  };

  const subject = getHeaderValue(message.payload?.headers, 'Subject') || '(No subject)';
  const from = getHeaderValue(message.payload?.headers, 'From') || 'Unknown sender';
  const to = getHeaderValue(message.payload?.headers, 'To');
  const date = getHeaderValue(message.payload?.headers, 'Date');
  const body = message.payload ? extractMessageBody(message.payload) : (message.snippet ?? '');

  const content = [
    `Subject: ${subject}`,
    `From: ${from}`,
    to ? `To: ${to}` : '',
    date ? `Date: ${date}` : '',
    '',
    body || message.snippet || '',
  ]
    .filter(Boolean)
    .join('\n');

  const safeSubject = sanitizeFileNameBase(subject);
  return {
    fileName: `${safeSubject || message.id}.txt`,
    content,
  };
}
