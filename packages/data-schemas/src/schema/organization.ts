import { Schema } from 'mongoose';
import type { IOrganization } from '~/types';
import { OrganizationStatus } from '~/types/organization';

/** Longest organization name accepted at registration, creation or rename. */
export const ORGANIZATION_NAME_MAX_LENGTH = 80;

const organizationSchema: Schema<IOrganization> = new Schema<IOrganization>(
  {
    /** The organization's own tenant: every record that belongs to it carries this id. The
     *  isolation plugin stamps it as well, so a record can never be saved into another one. */
    tenantId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: ORGANIZATION_NAME_MAX_LENGTH,
    },
    status: {
      type: String,
      enum: Object.values(OrganizationStatus),
      default: OrganizationStatus.ACTIVE,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
);

organizationSchema.index({ tenantId: 1 }, { unique: true });

export default organizationSchema;
