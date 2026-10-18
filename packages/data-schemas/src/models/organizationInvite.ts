import { Model } from 'mongoose';
import type * as t from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import organizationInviteSchema from '~/schema/organizationInvite';

export function createOrganizationInviteModel(
  mongoose: typeof import('mongoose'),
): Model<t.IOrganizationInvite> {
  applyTenantIsolation(organizationInviteSchema);
  return (
    mongoose.models.OrganizationInvite ||
    mongoose.model<t.IOrganizationInvite>('OrganizationInvite', organizationInviteSchema)
  );
}
