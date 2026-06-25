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

export interface GmailComposeOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body: string;
  replyToMessageId?: string;
}

export interface GmailDraftCreated {
  id: string;
  messageId: string;
  threadId: string;
}

export interface GmailMessageSent {
  id: string;
  threadId: string;
  labelIds: string[];
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

export interface GmailLabelModification {
  messageId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

export interface GmailLabelModificationResult {
  id: string;
  labelIds: string[];
}

function normalizeRecipients(addresses: string[] | undefined): string[] {
  return (addresses ?? []).map((address) => address.trim()).filter(Boolean);
}

function isAsciiOnly(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 127) {
      return false;
    }
  }
  return true;
}

function encodeHeaderValue(value: string): string {
  if (isAsciiOnly(value)) {
    return value;
  }
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

function wrapBase64(value: string): string {
  return value.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

interface RawEmailOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

function buildRawEmail(options: RawEmailOptions): string {
  const headers: string[] = [`To: ${options.to.join(', ')}`];

  const cc = normalizeRecipients(options.cc);
  if (cc.length) {
    headers.push(`Cc: ${cc.join(', ')}`);
  }
  const bcc = normalizeRecipients(options.bcc);
  if (bcc.length) {
    headers.push(`Bcc: ${bcc.join(', ')}`);
  }

  headers.push(`Subject: ${encodeHeaderValue(options.subject ?? '')}`);
  if (options.inReplyTo) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`);
  }
  if (options.references) {
    headers.push(`References: ${options.references}`);
  }
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push('Content-Transfer-Encoding: base64');

  const encodedBody = wrapBase64(Buffer.from(options.body ?? '', 'utf-8').toString('base64'));
  const mime = `${headers.join('\r\n')}\r\n\r\n${encodedBody}`;
  return Buffer.from(mime, 'utf-8').toString('base64url');
}

function ensureReplyPrefix(subject: string): string {
  if (/^re:/i.test(subject.trim())) {
    return subject;
  }
  return `Re: ${subject}`;
}

interface GmailReplyContext {
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  subject?: string;
}

async function resolveGmailReplyContext(
  accessToken: string,
  messageId: string,
): Promise<GmailReplyContext> {
  const response = await fetch(
    `${GMAIL_API_ROOT}/messages/${messageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${body}`);
  }

  const message = (await response.json()) as {
    threadId?: string;
    payload?: { headers?: Array<{ name?: string; value?: string }> };
  };

  const messageIdHeader = getHeaderValue(message.payload?.headers, 'Message-ID');
  const existingReferences = getHeaderValue(message.payload?.headers, 'References');
  const subject = getHeaderValue(message.payload?.headers, 'Subject');
  const references = [existingReferences, messageIdHeader].filter(Boolean).join(' ');

  return {
    threadId: message.threadId,
    inReplyTo: messageIdHeader || undefined,
    references: references || undefined,
    subject: subject || undefined,
  };
}

function assertComposeOptions(options: GmailComposeOptions): string[] {
  const to = normalizeRecipients(options.to);
  if (!to.length) {
    throw new Error('At least one recipient is required in "to".');
  }
  if (!options.body?.trim()) {
    throw new Error('Email body is required.');
  }
  return to;
}

async function buildGmailComposePayload(
  accessToken: string,
  options: GmailComposeOptions,
): Promise<{ raw: string; threadId?: string }> {
  const to = assertComposeOptions(options);
  let subject = options.subject;
  let context: GmailReplyContext = {};

  if (options.replyToMessageId) {
    context = await resolveGmailReplyContext(accessToken, options.replyToMessageId);
    if (!subject && context.subject) {
      subject = ensureReplyPrefix(context.subject);
    }
  }

  const raw = buildRawEmail({
    to,
    cc: options.cc,
    bcc: options.bcc,
    subject,
    body: options.body,
    inReplyTo: context.inReplyTo,
    references: context.references,
  });

  return { raw, threadId: context.threadId };
}

export async function createGmailDraft(
  accessToken: string,
  options: GmailComposeOptions,
): Promise<GmailDraftCreated> {
  const { raw, threadId } = await buildGmailComposePayload(accessToken, options);

  const response = await fetch(`${GMAIL_API_ROOT}/drafts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: { raw, ...(threadId ? { threadId } : {}) },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${body}`);
  }

  const draft = (await response.json()) as {
    id: string;
    message?: { id?: string; threadId?: string };
  };

  return {
    id: draft.id,
    messageId: draft.message?.id ?? '',
    threadId: draft.message?.threadId ?? threadId ?? '',
  };
}

export async function sendGmailMessage(
  accessToken: string,
  options: GmailComposeOptions,
): Promise<GmailMessageSent> {
  const { raw, threadId } = await buildGmailComposePayload(accessToken, options);

  const response = await fetch(`${GMAIL_API_ROOT}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${body}`);
  }

  const sent = (await response.json()) as {
    id: string;
    threadId: string;
    labelIds?: string[];
  };

  return {
    id: sent.id,
    threadId: sent.threadId,
    labelIds: sent.labelIds ?? [],
  };
}

export async function listGmailLabels(accessToken: string): Promise<GmailLabel[]> {
  const response = await fetch(`${GMAIL_API_ROOT}/labels`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    labels?: Array<{ id: string; name: string; type?: string }>;
  };

  return (payload.labels ?? []).map((label) => ({
    id: label.id,
    name: label.name,
    type: label.type ?? 'user',
  }));
}

export async function modifyGmailMessageLabels(
  accessToken: string,
  modification: GmailLabelModification,
): Promise<GmailLabelModificationResult> {
  const addLabelIds = modification.addLabelIds?.filter(Boolean) ?? [];
  const removeLabelIds = modification.removeLabelIds?.filter(Boolean) ?? [];

  if (!addLabelIds.length && !removeLabelIds.length) {
    throw new Error('Provide at least one label to add or remove.');
  }

  const response = await fetch(`${GMAIL_API_ROOT}/messages/${modification.messageId}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${body}`);
  }

  const result = (await response.json()) as { id: string; labelIds?: string[] };
  return {
    id: result.id,
    labelIds: result.labelIds ?? [],
  };
}
