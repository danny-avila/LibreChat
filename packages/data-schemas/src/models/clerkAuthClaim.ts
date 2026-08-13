import { Model } from 'mongoose';
import type * as t from '~/types';
import clerkAuthClaimSchema from '~/schema/clerkAuthClaim';

/**
 * ClerkAuthClaim is a global, cross-tenant control-plane collection (replay
 * fences and Clerk session/user revocation state keyed by Clerk's own IDs,
 * not LibreChat tenant IDs). Do NOT apply the tenant isolation plugin here —
 * webhook-driven revocation (Fixed Contract 8) must see and mutate every
 * tenant's claims from a single system-scoped write.
 */
export function createClerkAuthClaimModel(
  mongoose: typeof import('mongoose'),
): Model<t.IClerkAuthClaim> {
  return (
    mongoose.models.ClerkAuthClaim ||
    mongoose.model<t.IClerkAuthClaim>('ClerkAuthClaim', clerkAuthClaimSchema)
  );
}
