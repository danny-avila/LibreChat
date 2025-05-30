import mongoose from '~/mongoose';
import roleSchema from '~/schema/role';
import type { IRole } from '~/types';

export const Role = mongoose.models.Role || mongoose.model('Role', roleSchema) as any;
