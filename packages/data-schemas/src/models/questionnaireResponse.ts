import { Model } from 'mongoose';
import type { IQuestionnaireResponse } from '~/types';
import questionnaireResponseSchema from '~/schema/questionnaireResponse';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createQuestionnaireResponseModel(
  mongoose: typeof import('mongoose'),
): Model<IQuestionnaireResponse> {
  applyTenantIsolation(questionnaireResponseSchema);
  return (
    mongoose.models.QuestionnaireResponse ||
    mongoose.model<IQuestionnaireResponse>('QuestionnaireResponse', questionnaireResponseSchema)
  );
}
