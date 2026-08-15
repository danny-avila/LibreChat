import { Schema, Document } from 'mongoose';

export type SearchEventKind = 'message' | 'conversation' | 'shared-link';

export type SearchEventOp = 'upsert' | 'tombstone';

export interface ISearchEvent extends Document {
  tenantId: string;
  userId: string;
  kind: SearchEventKind;
  recordId: string;
  op: SearchEventOp;
  createdAt: Date;
}

/** Events survive long enough to cover a projector outage, then expire. */
const EVENT_TTL_SECONDS = 86_400;

/**
 * Append-only projection queue. Hooks and explicit call sites fan *in* to this
 * collection; the lease-holding projector is the only reader. Events carry a key
 * and an op — never content — so the projector always re-reads the authoritative
 * source before writing, and duplicates are free to collapse at drain time.
 *
 * The queue is deliberately not unique-keyed: an upsert racing a tombstone for
 * the same record must both be recorded, because the drain resolves them by
 * precedence rather than by whichever write happened to land first.
 */
const searchEventSchema: Schema<ISearchEvent> = new Schema<ISearchEvent>(
  {
    tenantId: { type: String, required: true },
    userId: { type: String, required: true },
    kind: {
      type: String,
      required: true,
      enum: ['message', 'conversation', 'shared-link'],
    },
    recordId: { type: String, required: true },
    op: { type: String, required: true, enum: ['upsert', 'tombstone'] },
    createdAt: { type: Date, default: Date.now, expires: EVENT_TTL_SECONDS },
  },
  { versionKey: false, minimize: false },
);

export default searchEventSchema;
