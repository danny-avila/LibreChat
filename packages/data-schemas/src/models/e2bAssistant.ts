import e2bAssistantSchema from '~/schema/e2bAssistant';

/**
 * Creates or returns E2B Assistant model using provided mongoose instance and schema
 */
export function createE2BAssistantModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.E2BAssistant || mongoose.model('E2BAssistant', e2bAssistantSchema);
}
