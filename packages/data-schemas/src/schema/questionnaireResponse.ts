import { Schema } from 'mongoose';
import type { IQuestionnaireResponse, IQuestionnaireAnswer } from '~/types';

const answerSchema = new Schema<IQuestionnaireAnswer>(
  {
    questionId: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const questionnaireResponseSchema: Schema<IQuestionnaireResponse> =
  new Schema<IQuestionnaireResponse>(
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
      answers: {
        type: [answerSchema],
        required: true,
        default: [],
      },
      submittedAt: {
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

questionnaireResponseSchema.index({ questionnaireId: 1, user: 1, tenantId: 1 }, { unique: true });

export default questionnaireResponseSchema;
