import type { Document, Types } from 'mongoose';

export type AgentCategory = {
  /** Unique identifier for the category (e.g., 'general', 'hr', 'finance') */
  value: string;
  /** Display label for the category */
  label: string;
  /** Description of the category */
  description?: string;
  /** Display order for sorting categories */
  order: number;
  /** Whether the category is active and should be displayed */
  isActive: boolean;
  /** Whether this is a custom user-created category */
  custom?: boolean;
};

export type IAgentCategory = AgentCategory &
  Document & {
    _id: Types.ObjectId;
  };
