import { Model } from 'mongoose';
import type { IQuestionnaireDismissal } from '~/types';
import questionnaireDismissalSchema from '~/schema/questionnaireDismissal';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createQuestionnaireDismissalModel(
  mongoose: typeof import('mongoose'),
): Model<IQuestionnaireDismissal> {
  applyTenantIsolation(questionnaireDismissalSchema);
  return (
    mongoose.models.QuestionnaireDismissal ||
    mongoose.model<IQuestionnaireDismissal>('QuestionnaireDismissal', questionnaireDismissalSchema)
  );
}
