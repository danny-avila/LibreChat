import magicLinkSchema from '~/schema/magiclink';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';

export function createMagicLinkModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(magicLinkSchema);
  return (
    mongoose.models.MagicLink ||
    mongoose.model<t.IMagicLink>('MagicLink', magicLinkSchema)
  );
}
