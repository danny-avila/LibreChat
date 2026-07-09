import { inferMimeType } from 'librechat-data-provider';

export type ClioToolAction =
  | 'search_documents'
  | 'list_matters'
  | 'get_matter'
  | 'list_contacts'
  | 'get_contact'
  | 'list_tasks'
  | 'list_activities'
  | 'list_communications'
  | 'list_calendar_entries'
  | 'list_users'
  | 'get_user'
  | 'create_matter'
  | 'create_contact'
  | 'create_task'
  | 'create_activity_time_entry'
  | 'create_document';

export interface ClioDocumentSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface ClioSearchResult {
  files: ClioDocumentSummary[];
  nextPageToken?: string;
}

export interface ClioSearchOptions {
  query?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface ClioListOptions {
  query?: string;
  maxResults?: number;
  pageToken?: string;
  status?: string;
  matterId?: string | number;
  startDate?: string;
  endDate?: string;
}

export interface ClioActionParams {
  query?: string;
  page_size?: number;
  page_token?: string;
  max_results?: number;
  status?: string;
  matter_id?: string | number;
  contact_id?: string | number;
  user_id?: string | number;
  start_date?: string;
  end_date?: string;
  client_id?: string | number;
  description?: string;
  responsible_attorney_id?: string | number;
  name?: string;
  type?: string;
  first_name?: string;
  last_name?: string;
  assignee_id?: string | number;
  assignee_type?: 'User' | 'Contact';
  quantity_hours?: number;
  date?: string;
  note?: string;
  content?: string;
  filename?: string;
}

export interface ClioMatterSummary {
  id: string;
  displayNumber?: string;
  description?: string;
  status?: string;
  clientId?: string;
  openDate?: string;
}

export interface ClioContactSummary {
  id: string;
  name?: string;
  type?: string;
  email?: string;
}

export interface ClioTaskSummary {
  id: string;
  name?: string;
  status?: string;
  dueAt?: string;
  matterId?: string;
}

export interface ClioActivitySummary {
  id: string;
  type?: string;
  date?: string;
  quantityHours?: string;
  note?: string;
  matterId?: string;
}

export interface ClioCommunicationSummary {
  id: string;
  subject?: string;
  type?: string;
  date?: string;
  matterId?: string;
}

export interface ClioCalendarEntrySummary {
  id: string;
  summary?: string;
  startAt?: string;
  endAt?: string;
  matterId?: string;
}

export interface ClioUserSummary {
  id: string;
  name?: string;
  email?: string;
  enabled?: boolean;
}

export interface ClioCreatedRecord {
  id: string;
}

export interface ClioListResult<T> {
  records: T[];
  nextPageToken?: string;
}

const CLIO_API_URL = 'https://app.clio.com/api/v4';
const DOCUMENT_FIELDS = 'id,name,filename,content_type,size,updated_at';
const MATTER_LIST_FIELDS = 'id,display_number,description,status,client_id,open_date';
const MATTER_DETAIL_FIELDS = MATTER_LIST_FIELDS;
const CONTACT_LIST_FIELDS = 'id,name,type,primary_email_address';
const CONTACT_DETAIL_FIELDS = CONTACT_LIST_FIELDS;
const TASK_LIST_FIELDS = 'id,name,status,due_at,matter{id}';
const ACTIVITY_LIST_FIELDS = 'id,type,date,quantity_in_hours,note,matter{id}';
const COMMUNICATION_LIST_FIELDS = 'id,subject,type,date,matter{id}';
const CALENDAR_ENTRY_FIELDS = 'id,summary,start_at,end_at,matter{id}';
const USER_LIST_FIELDS = 'id,name,email,enabled';
const USER_DETAIL_FIELDS = USER_LIST_FIELDS;
const DOCUMENT_CREATE_FIELDS = 'id,latest_document_version{uuid,put_url,put_headers}';
const CREATE_RESPONSE_FIELDS = 'id';

type ClioIdRecord = { id?: number | string };

type ClioListResponse<T> = {
  data?: T[];
  meta?: {
    paging?: {
      next?: string;
    };
  };
};

type ClioSingleResponse<T> = {
  data?: T;
};

type ClioDocument = {
  id: number;
  name?: string;
  filename?: string;
  content_type?: string;
  size?: number;
  updated_at?: string;
};

type ClioPutHeader = {
  name?: string;
  value?: string;
};

type ClioDocumentVersion = {
  uuid?: string;
  put_url?: string;
  put_headers?: ClioPutHeader[];
};

type ClioMatterRecord = ClioIdRecord & {
  display_number?: string;
  description?: string;
  status?: string;
  client_id?: number;
  open_date?: string;
};

type ClioContactRecord = ClioIdRecord & {
  name?: string;
  type?: string;
  primary_email_address?: string;
};

type ClioTaskRecord = ClioIdRecord & {
  name?: string;
  status?: string;
  due_at?: string;
  matter?: ClioIdRecord;
};

type ClioActivityRecord = ClioIdRecord & {
  type?: string;
  date?: string;
  quantity_in_hours?: number;
  note?: string;
  matter?: ClioIdRecord;
};

type ClioCommunicationRecord = ClioIdRecord & {
  subject?: string;
  type?: string;
  date?: string;
  matter?: ClioIdRecord;
};

type ClioCalendarEntryRecord = ClioIdRecord & {
  summary?: string;
  start_at?: string;
  end_at?: string;
  matter?: ClioIdRecord;
};

type ClioUserRecord = ClioIdRecord & {
  name?: string;
  email?: string;
  enabled?: boolean;
};

function clampMaxResults(maxResults?: number, fallback = 20, max = 50): number {
  return Math.min(Math.max(maxResults ?? fallback, 1), max);
}

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(pageSize ?? 20, 1), 200);
}

function toId(value?: number | string | null): string {
  return value == null ? '' : String(value);
}

function parseNumericId(value: string | number | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} is required and must be a positive number.`);
  }
  return parsed;
}

function resolveClioMimeType(fileName: string, reportedMimeType?: string | null): string {
  const normalizedReported = reportedMimeType?.split(';')[0]?.trim() ?? '';
  return inferMimeType(fileName, normalizedReported);
}

function toFileSummary(document: ClioDocument): ClioDocumentSummary {
  const fileName = document.filename?.trim() || document.name?.trim() || `document-${document.id}`;

  return {
    id: String(document.id),
    name: fileName,
    mimeType: resolveClioMimeType(fileName, document.content_type),
    modifiedTime: document.updated_at,
    size: document.size != null ? String(document.size) : undefined,
  };
}

function toMatterSummary(matter: ClioMatterRecord): ClioMatterSummary {
  return {
    id: toId(matter.id),
    displayNumber: matter.display_number,
    description: matter.description,
    status: matter.status,
    clientId: matter.client_id != null ? String(matter.client_id) : undefined,
    openDate: matter.open_date,
  };
}

function toContactSummary(contact: ClioContactRecord): ClioContactSummary {
  return {
    id: toId(contact.id),
    name: contact.name,
    type: contact.type,
    email: contact.primary_email_address,
  };
}

function toTaskSummary(task: ClioTaskRecord): ClioTaskSummary {
  return {
    id: toId(task.id),
    name: task.name,
    status: task.status,
    dueAt: task.due_at,
    matterId: task.matter?.id != null ? String(task.matter.id) : undefined,
  };
}

function toActivitySummary(activity: ClioActivityRecord): ClioActivitySummary {
  return {
    id: toId(activity.id),
    type: activity.type,
    date: activity.date,
    quantityHours:
      activity.quantity_in_hours != null ? String(activity.quantity_in_hours) : undefined,
    note: activity.note,
    matterId: activity.matter?.id != null ? String(activity.matter.id) : undefined,
  };
}

function toCommunicationSummary(communication: ClioCommunicationRecord): ClioCommunicationSummary {
  return {
    id: toId(communication.id),
    subject: communication.subject,
    type: communication.type,
    date: communication.date,
    matterId: communication.matter?.id != null ? String(communication.matter.id) : undefined,
  };
}

function toCalendarEntrySummary(entry: ClioCalendarEntryRecord): ClioCalendarEntrySummary {
  return {
    id: toId(entry.id),
    summary: entry.summary,
    startAt: entry.start_at,
    endAt: entry.end_at,
    matterId: entry.matter?.id != null ? String(entry.matter.id) : undefined,
  };
}

function toUserSummary(user: ClioUserRecord): ClioUserSummary {
  return {
    id: toId(user.id),
    name: user.name,
    email: user.email,
    enabled: user.enabled,
  };
}

function toCreatedRecord(record: ClioIdRecord): ClioCreatedRecord {
  const id = toId(record.id);
  if (!id) {
    throw new Error('Clio did not return a created record id.');
  }
  return { id };
}

function buildUrl(
  path: string,
  params: Record<string, string | undefined>,
  pageToken?: string,
): string {
  if (pageToken?.startsWith('http')) {
    return pageToken;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') {
      searchParams.set(key, value);
    }
  }

  if (pageToken) {
    searchParams.set('page_token', pageToken);
  }

  const query = searchParams.toString();
  return query ? `${CLIO_API_URL}${path}?${query}` : `${CLIO_API_URL}${path}`;
}

async function clioRequest<T>(
  accessToken: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  options: {
    query?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const query = options.query ?? {};
  const url = buildUrl(path, query);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };

  const init: RequestInit = { method, headers };

  if (options.body != null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify({ data: options.body });
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Clio API error (${response.status}): ${errorBody}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

async function clioList<TRecord, TSummary>(
  accessToken: string,
  path: string,
  fields: string,
  options: ClioListOptions,
  mapRecord: (record: TRecord) => TSummary,
): Promise<ClioListResult<TSummary>> {
  const params: Record<string, string | undefined> = {
    fields,
    limit: String(clampMaxResults(options.maxResults)),
    order: 'updated_at(desc)',
    query: options.query?.trim() || undefined,
    status: options.status?.trim() || undefined,
    matter_id: options.matterId != null ? String(options.matterId) : undefined,
    from: options.startDate?.trim() || undefined,
    to: options.endDate?.trim() || undefined,
  };

  const url = buildUrl(path, params, options.pageToken);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Clio API error (${response.status}): ${errorBody}`);
  }

  const resolved = (await response.json()) as ClioListResponse<TRecord>;

  return {
    records: (resolved.data ?? []).map(mapRecord),
    nextPageToken: resolved.meta?.paging?.next,
  };
}

function buildDocumentsUrl(options: ClioSearchOptions): string {
  return buildUrl(
    '/documents.json',
    {
      fields: DOCUMENT_FIELDS,
      limit: String(clampPageSize(options.pageSize)),
      order: 'updated_at(desc)',
      query: options.query?.trim() || undefined,
    },
    options.pageToken,
  );
}

export async function searchClioDocuments(
  accessToken: string,
  options: ClioSearchOptions = {},
): Promise<ClioSearchResult> {
  const url = buildDocumentsUrl(options);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Clio API error (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as ClioListResponse<ClioDocument>;

  return {
    files: (payload.data ?? []).map(toFileSummary),
    nextPageToken: payload.meta?.paging?.next,
  };
}

export async function downloadClioDocument(
  accessToken: string,
  file: Pick<ClioDocumentSummary, 'id' | 'name' | 'mimeType'>,
): Promise<{ buffer: ArrayBuffer; fileName: string; mimeType: string }> {
  const response = await fetch(
    `${CLIO_API_URL}/documents/${encodeURIComponent(file.id)}/download.json`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      redirect: 'follow',
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Clio download failed (${response.status}): ${errorBody}`);
  }

  const buffer = await response.arrayBuffer();
  const mimeType = resolveClioMimeType(file.name, response.headers.get('content-type'));

  return {
    buffer,
    fileName: file.name,
    mimeType,
  };
}

export async function listClioMatters(
  accessToken: string,
  options: ClioListOptions = {},
): Promise<ClioListResult<ClioMatterSummary>> {
  return clioList(accessToken, '/matters.json', MATTER_LIST_FIELDS, options, toMatterSummary);
}

export async function getClioMatter(
  accessToken: string,
  matterId: string | number,
): Promise<ClioMatterSummary> {
  const payload = await clioRequest<ClioSingleResponse<ClioMatterRecord>>(
    accessToken,
    'GET',
    `/matters/${encodeURIComponent(String(matterId))}.json`,
    { query: { fields: MATTER_DETAIL_FIELDS } },
  );

  if (!payload.data) {
    throw new Error(`Clio matter ${matterId} was not found.`);
  }

  return toMatterSummary(payload.data);
}

export async function listClioContacts(
  accessToken: string,
  options: ClioListOptions = {},
): Promise<ClioListResult<ClioContactSummary>> {
  return clioList(accessToken, '/contacts.json', CONTACT_LIST_FIELDS, options, toContactSummary);
}

export async function getClioContact(
  accessToken: string,
  contactId: string | number,
): Promise<ClioContactSummary> {
  const payload = await clioRequest<ClioSingleResponse<ClioContactRecord>>(
    accessToken,
    'GET',
    `/contacts/${encodeURIComponent(String(contactId))}.json`,
    { query: { fields: CONTACT_DETAIL_FIELDS } },
  );

  if (!payload.data) {
    throw new Error(`Clio contact ${contactId} was not found.`);
  }

  return toContactSummary(payload.data);
}

export async function listClioTasks(
  accessToken: string,
  options: ClioListOptions = {},
): Promise<ClioListResult<ClioTaskSummary>> {
  return clioList(accessToken, '/tasks.json', TASK_LIST_FIELDS, options, toTaskSummary);
}

export async function listClioActivities(
  accessToken: string,
  options: ClioListOptions = {},
): Promise<ClioListResult<ClioActivitySummary>> {
  return clioList(
    accessToken,
    '/activities.json',
    ACTIVITY_LIST_FIELDS,
    options,
    toActivitySummary,
  );
}

export async function listClioCommunications(
  accessToken: string,
  options: ClioListOptions = {},
): Promise<ClioListResult<ClioCommunicationSummary>> {
  return clioList(
    accessToken,
    '/communications.json',
    COMMUNICATION_LIST_FIELDS,
    options,
    toCommunicationSummary,
  );
}

export async function listClioCalendarEntries(
  accessToken: string,
  options: ClioListOptions = {},
): Promise<ClioListResult<ClioCalendarEntrySummary>> {
  return clioList(
    accessToken,
    '/calendar_entries.json',
    CALENDAR_ENTRY_FIELDS,
    options,
    toCalendarEntrySummary,
  );
}

export async function listClioUsers(
  accessToken: string,
  options: ClioListOptions = {},
): Promise<ClioListResult<ClioUserSummary>> {
  return clioList(accessToken, '/users.json', USER_LIST_FIELDS, options, toUserSummary);
}

export async function getClioUser(
  accessToken: string,
  userId: string | number,
): Promise<ClioUserSummary> {
  const payload = await clioRequest<ClioSingleResponse<ClioUserRecord>>(
    accessToken,
    'GET',
    `/users/${encodeURIComponent(String(userId))}.json`,
    { query: { fields: USER_DETAIL_FIELDS } },
  );

  if (!payload.data) {
    throw new Error(`Clio user ${userId} was not found.`);
  }

  return toUserSummary(payload.data);
}

export async function createClioMatter(
  accessToken: string,
  params: Pick<
    ClioActionParams,
    'client_id' | 'description' | 'status' | 'responsible_attorney_id'
  >,
): Promise<ClioCreatedRecord> {
  const clientId = parseNumericId(params.client_id, 'client_id');
  const description = params.description?.trim();
  if (!description) {
    throw new Error('description is required for create_matter.');
  }

  const body: Record<string, unknown> = {
    client: { id: clientId },
    description,
  };

  if (params.status?.trim()) {
    body.status = params.status.trim();
  }

  if (params.responsible_attorney_id != null) {
    body.responsible_attorney = {
      id: parseNumericId(params.responsible_attorney_id, 'responsible_attorney_id'),
    };
  }

  const payload = await clioRequest<ClioSingleResponse<ClioIdRecord>>(
    accessToken,
    'POST',
    '/matters.json',
    {
      query: { fields: CREATE_RESPONSE_FIELDS },
      body,
    },
  );

  return toCreatedRecord(payload.data ?? {});
}

export async function createClioContact(
  accessToken: string,
  params: Pick<ClioActionParams, 'name' | 'type' | 'first_name' | 'last_name'>,
): Promise<ClioCreatedRecord> {
  const name = params.name?.trim();
  if (!name) {
    throw new Error('name is required for create_contact.');
  }

  const contactType = params.type?.trim() || 'Person';
  const body: Record<string, unknown> = {
    name,
    type: contactType,
  };

  if (params.first_name?.trim()) {
    body.first_name = params.first_name.trim();
  }

  if (params.last_name?.trim()) {
    body.last_name = params.last_name.trim();
  }

  const payload = await clioRequest<ClioSingleResponse<ClioIdRecord>>(
    accessToken,
    'POST',
    '/contacts.json',
    {
      query: { fields: CREATE_RESPONSE_FIELDS },
      body,
    },
  );

  return toCreatedRecord(payload.data ?? {});
}

export async function createClioTask(
  accessToken: string,
  params: Pick<
    ClioActionParams,
    'matter_id' | 'name' | 'description' | 'assignee_id' | 'assignee_type'
  >,
): Promise<ClioCreatedRecord> {
  const matterId = parseNumericId(params.matter_id, 'matter_id');
  const name = params.name?.trim();
  if (!name) {
    throw new Error('name is required for create_task.');
  }

  if (params.assignee_id == null) {
    throw new Error('assignee_id is required for create_task.');
  }

  const body: Record<string, unknown> = {
    matter: { id: matterId },
    name,
    assignee: {
      id: parseNumericId(params.assignee_id, 'assignee_id'),
      type: params.assignee_type ?? 'User',
    },
  };

  if (params.description?.trim()) {
    body.description = params.description.trim();
  }

  const payload = await clioRequest<ClioSingleResponse<ClioIdRecord>>(
    accessToken,
    'POST',
    '/tasks.json',
    {
      query: { fields: CREATE_RESPONSE_FIELDS },
      body,
    },
  );

  return toCreatedRecord(payload.data ?? {});
}

export async function createClioActivityTimeEntry(
  accessToken: string,
  params: Pick<ClioActionParams, 'matter_id' | 'quantity_hours' | 'date' | 'note'>,
): Promise<ClioCreatedRecord> {
  const matterId = parseNumericId(params.matter_id, 'matter_id');
  const quantityHours = Number(params.quantity_hours);
  if (!Number.isFinite(quantityHours) || quantityHours <= 0) {
    throw new Error(
      'quantity_hours is required for create_activity_time_entry and must be positive.',
    );
  }

  const body: Record<string, unknown> = {
    type: 'TimeEntry',
    matter: { id: matterId },
    quantity: Math.round(quantityHours * 3600),
    date: params.date?.trim() || new Date().toISOString().slice(0, 10),
  };

  if (params.note?.trim()) {
    body.note = params.note.trim();
  }

  const payload = await clioRequest<ClioSingleResponse<ClioIdRecord>>(
    accessToken,
    'POST',
    '/activities.json',
    {
      query: { fields: CREATE_RESPONSE_FIELDS },
      body,
    },
  );

  return toCreatedRecord(payload.data ?? {});
}

function resolveDocumentFileName(params: Pick<ClioActionParams, 'name' | 'filename'>): string {
  const explicit = params.filename?.trim() || params.name?.trim();
  if (!explicit) {
    throw new Error('name is required for create_document.');
  }
  return explicit.includes('.') ? explicit : `${explicit}.txt`;
}

async function uploadClioDocumentContent(
  putUrl: string,
  putHeaders: ClioPutHeader[] | undefined,
  content: string,
  mimeType: string,
): Promise<void> {
  const headers: Record<string, string> = {};
  for (const header of putHeaders ?? []) {
    if (header.name && header.value) {
      headers[header.name] = header.value;
    }
  }

  if (!headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = mimeType;
  }

  const response = await fetch(putUrl, {
    method: 'PUT',
    headers,
    body: content,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Clio document upload failed (${response.status}): ${errorBody}`);
  }
}

export async function createClioDocument(
  accessToken: string,
  params: Pick<ClioActionParams, 'matter_id' | 'name' | 'filename' | 'content'>,
): Promise<ClioCreatedRecord> {
  const matterId = parseNumericId(params.matter_id, 'matter_id');
  const fileName = resolveDocumentFileName(params);
  const mimeType = resolveClioMimeType(fileName, 'text/plain');

  const payload = await clioRequest<
    ClioSingleResponse<ClioIdRecord & { latest_document_version?: ClioDocumentVersion }>
  >(accessToken, 'POST', '/documents.json', {
    query: { fields: DOCUMENT_CREATE_FIELDS },
    body: {
      name: fileName,
      parent: {
        id: matterId,
        type: 'Matter',
      },
    },
  });

  const created = toCreatedRecord(payload.data ?? {});
  const version = payload.data?.latest_document_version;
  const content = params.content?.trim() ?? '';

  if (content && version?.put_url) {
    await uploadClioDocumentContent(version.put_url, version.put_headers, content, mimeType);

    if (version.uuid) {
      await clioRequest<ClioSingleResponse<ClioIdRecord>>(
        accessToken,
        'PATCH',
        `/documents/${encodeURIComponent(created.id)}.json`,
        {
          query: { fields: 'id,latest_document_version{fully_uploaded}' },
          body: {
            uuid: version.uuid,
            fully_uploaded: true,
          },
        },
      );
    }
  }

  return created;
}

function toListOptions(params: ClioActionParams): ClioListOptions {
  return {
    query: params.query,
    maxResults: params.max_results ?? params.page_size,
    pageToken: params.page_token,
    status: params.status,
    matterId: params.matter_id,
    startDate: params.start_date,
    endDate: params.end_date,
  };
}

export async function runClioAction(
  accessToken: string,
  action: ClioToolAction,
  params: ClioActionParams = {},
): Promise<unknown> {
  switch (action) {
    case 'search_documents': {
      const result = await searchClioDocuments(accessToken, {
        query: params.query,
        pageSize: params.page_size ?? params.max_results,
        pageToken: params.page_token,
      });
      return result;
    }
    case 'list_matters':
      return listClioMatters(accessToken, toListOptions(params));
    case 'get_matter':
      return getClioMatter(accessToken, parseNumericId(params.matter_id, 'matter_id'));
    case 'list_contacts':
      return listClioContacts(accessToken, toListOptions(params));
    case 'get_contact':
      return getClioContact(accessToken, parseNumericId(params.contact_id, 'contact_id'));
    case 'list_tasks':
      return listClioTasks(accessToken, toListOptions(params));
    case 'list_activities':
      return listClioActivities(accessToken, toListOptions(params));
    case 'list_communications':
      return listClioCommunications(accessToken, toListOptions(params));
    case 'list_calendar_entries':
      return listClioCalendarEntries(accessToken, toListOptions(params));
    case 'list_users':
      return listClioUsers(accessToken, toListOptions(params));
    case 'get_user':
      return getClioUser(accessToken, parseNumericId(params.user_id, 'user_id'));
    case 'create_matter':
      return createClioMatter(accessToken, params);
    case 'create_contact':
      return createClioContact(accessToken, params);
    case 'create_task':
      return createClioTask(accessToken, params);
    case 'create_activity_time_entry':
      return createClioActivityTimeEntry(accessToken, params);
    case 'create_document':
      return createClioDocument(accessToken, params);
    default:
      throw new Error(`Unsupported Clio action: ${action}`);
  }
}
