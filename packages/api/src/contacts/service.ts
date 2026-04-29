import type { Types } from 'mongoose';
import { createContactModel, type IContact } from '@librechat/data-schemas';

export type ContactMetadata = Record<string, string | number | boolean | string[] | null>;

export interface ContactListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export interface ContactInput {
  name: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
  metadata?: ContactMetadata;
}

export interface ContactRecord {
  _id: Types.ObjectId;
  name: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
  tags: string[];
  notes?: string;
  metadata: ContactMetadata;
  deleted_at?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  tenantId?: string;
}

export interface ContactListResponse {
  data: ContactRecord[];
  total: number;
  page: number;
  limit: number;
}

function getContactModel(mongoose: typeof import('mongoose')) {
  return createContactModel(mongoose);
}

function normalizeSearch(search?: string): string | null {
  const trimmed = search?.trim();
  return trimmed ? trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
}

function buildSearchFilter(search?: string) {
  const term = normalizeSearch(search);
  if (!term) {
    return {};
  }

  const pattern = new RegExp(term, 'i');
  return {
    $or: [
      { name: pattern },
      { company: pattern },
      { role: pattern },
      { email: pattern },
      { phone: pattern },
      { tags: pattern },
      { notes: pattern },
    ],
  };
}

function normalizeContactPayload(input: ContactInput): Partial<IContact> {
  return {
    name: input.name.trim(),
    company: input.company?.trim() || '',
    role: input.role?.trim() || '',
    email: input.email?.trim().toLowerCase() || '',
    phone: input.phone?.trim() || '',
    tags: Array.isArray(input.tags)
      ? input.tags.map((tag) => tag.trim()).filter((tag) => tag !== '')
      : [],
    notes: input.notes?.trim() || '',
    metadata: input.metadata ?? {},
  };
}

export function createContactsService(mongoose: typeof import('mongoose')) {
  const Contact = getContactModel(mongoose);

  async function listContacts(params: ContactListParams = {}): Promise<ContactListResponse> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, Math.min(params.limit ?? 50, 100));
    const skip = (page - 1) * limit;
    const filter = {
      deleted_at: null,
      ...buildSearchFilter(params.search),
    };

    const [data, total] = await Promise.all([
      Contact.find(filter).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Contact.countDocuments(filter),
    ]);

    return {
   data: data as unknown as ContactRecord[],
      total,
      page,
      limit,
    };
  }

  async function getContactById(contactId: string): Promise<ContactRecord | null> {
    return Contact.findOne({ _id: contactId, deleted_at: null }).lean<ContactRecord>();
  }

  async function createContact(input: ContactInput): Promise<ContactRecord> {
    const contact = await Contact.create(normalizeContactPayload(input));
    return contact.toObject() as ContactRecord;
  }

  async function updateContact(
    contactId: string,
    input: Partial<ContactInput>,
  ): Promise<ContactRecord | null> {
    const updates: Partial<IContact> = {};

    if (typeof input.name === 'string') updates.name = input.name.trim();
    if (typeof input.company === 'string') updates.company = input.company.trim();
    if (typeof input.role === 'string') updates.role = input.role.trim();
    if (typeof input.email === 'string') updates.email = input.email.trim().toLowerCase();
    if (typeof input.phone === 'string') updates.phone = input.phone.trim();
    if (Array.isArray(input.tags)) {
      updates.tags = input.tags.map((tag) => tag.trim()).filter((tag) => tag !== '');
    }
    if (typeof input.notes === 'string') updates.notes = input.notes.trim();
    if (input.metadata) updates.metadata = input.metadata;

    return Contact.findOneAndUpdate(
      { _id: contactId, deleted_at: null },
      { $set: updates },
      { new: true },
    ).lean<ContactRecord>();
  }

  async function deleteContact(contactId: string): Promise<ContactRecord | null> {
    return Contact.findOneAndUpdate(
      { _id: contactId, deleted_at: null },
      { $set: { deleted_at: new Date() } },
      { new: true },
    ).lean<ContactRecord>();
  }

  return {
    Contact,
    listContacts,
    getContactById,
    createContact,
    updateContact,
    deleteContact,
  };
}
