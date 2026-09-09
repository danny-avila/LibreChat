import { Model } from 'mongoose';
import type { IQuestionnaire } from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import questionnaireSchema from '~/schema/questionnaire';

export function createQuestionnaireModel(
  mongoose: typeof import('mongoose'),
): Model<IQuestionnaire> {
  applyTenantIsolation(questionnaireSchema);
  return (
    mongoose.models.Questionnaire ||
    mongoose.model<IQuestionnaire>('Questionnaire', questionnaireSchema)
  );
}
