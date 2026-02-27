import { Types } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';

/**
 * Normalizes a principalId to the correct type for MongoDB queries and storage.
 * USER and GROUP principals are stored as ObjectIds; ROLE principals are strings.
 * Ensures a string caller ID is cast to ObjectId so it matches documents written
 * by `grantCapability` — which always stores user/group IDs as ObjectIds to match
 * what `getUserPrincipals` returns.
 */
export const normalizePrincipalId = (
  principalId: string | Types.ObjectId,
  principalType: PrincipalType,
): string | Types.ObjectId =>
  typeof principalId === 'string' && principalType !== PrincipalType.ROLE
    ? new Types.ObjectId(principalId)
    : principalId;
