import type { Document } from 'mongoose';

export interface IContact extends Document {
  name: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
  metadata?: Record<string, string | number | boolean | string[] | null>;
  deleted_at?: Date | null;
  tenantId?: string;
}
