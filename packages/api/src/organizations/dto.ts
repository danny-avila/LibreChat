import { OrganizationStatus } from '@librechat/data-schemas';
import { OrganizationMemberStatus } from 'librechat-data-provider';
import type {
  TOrganization,
  TOrganizationInvite,
  TOrganizationMember,
} from 'librechat-data-provider';
import type { OrganizationRecord, OrganizationInviteRecord } from '@librechat/data-schemas';
import type { AuthUserRecord } from './types';

type Timestamped = { createdAt?: Date | string };

function isoDate(value?: Date | string): string | undefined {
  if (value == null) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
}

/** An organization as the client sees it; its tenant id is its public id. */
export function toOrganization(record: OrganizationRecord): TOrganization {
  return {
    id: record.tenantId,
    name: record.name,
    createdAt: isoDate(record.createdAt),
    ...(record.status && record.status !== OrganizationStatus.ACTIVE
      ? { status: record.status }
      : {}),
  };
}

/** A member as the organization's admins see it: profile, role and status, no credentials. */
export function toOrganizationMember(record: AuthUserRecord & Timestamped): TOrganizationMember {
  return {
    id: record._id.toString(),
    name: record.name,
    username: record.username,
    email: record.email ?? '',
    avatar: record.avatar,
    role: record.role ?? '',
    status: record.status ?? OrganizationMemberStatus.ACTIVE,
    createdAt: isoDate(record.createdAt),
  };
}

/** An invite without its token hash; the raw token is only ever in the link. */
export function toOrganizationInvite(
  record: OrganizationInviteRecord,
  inviter?: { id: string; name?: string },
): TOrganizationInvite {
  return {
    id: record._id.toString(),
    kind: record.kind,
    email: record.email,
    role: record.role,
    status: record.status,
    expiresAt: isoDate(record.expiresAt) ?? '',
    maxUses: record.maxUses,
    useCount: record.useCount,
    ...(inviter ? { invitedBy: inviter } : {}),
    createdAt: isoDate(record.createdAt),
  };
}
