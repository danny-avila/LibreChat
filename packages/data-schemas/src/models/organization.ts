import { Model } from 'mongoose';
import type * as t from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import organizationSchema from '~/schema/organization';

export function createOrganizationModel(
  mongoose: typeof import('mongoose'),
): Model<t.IOrganization> {
  applyTenantIsolation(organizationSchema);
  return (
    mongoose.models.Organization ||
    mongoose.model<t.IOrganization>('Organization', organizationSchema)
  );
}
