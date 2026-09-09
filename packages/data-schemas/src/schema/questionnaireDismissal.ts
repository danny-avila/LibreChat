import { Schema } from 'mongoose';
import type { IQuestionnaireDismissal } from '~/types';

const questionnaireDismissalSchema: Schema<IQuestionnaireDismissal> =
  new Schema<IQuestionnaireDismissal>(
    {
      questionnaireId: {
        type: String,
        required: true,
        index: true,
      },
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },
      dismissedAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
      tenantId: {
        type: String,
        index: true,
      },
    },
    { timestamps: true },
  );

questionnaireDismissalSchema.index({ questionnaireId: 1, user: 1, tenantId: 1 }, { unique: true });

export default questionnaireDismissalSchema;
