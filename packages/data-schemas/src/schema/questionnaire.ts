import { Schema } from 'mongoose';
import type { IQuestionnaire, IQuestionnaireQuestion } from '~/types';

const questionSchema = new Schema<IQuestionnaireQuestion>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['text', 'scale', 'numeric', 'single_choice', 'multiple_choice'],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    required: { type: Boolean, default: false },
    section: { type: String },
    min: { type: Number },
    max: { type: Number },
    minLabel: { type: String },
    maxLabel: { type: String },
    options: { type: [String], default: undefined },
    maxSelections: { type: Number },
  },
  { _id: false },
);

const questionnaireSchema: Schema<IQuestionnaire> = new Schema<IQuestionnaire>(
  {
    questionnaireId: {
      type: String,
      required: true,
      index: true,
    },
    label: {
      type: String,
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'closed'],
      required: true,
      default: 'draft',
      index: true,
    },
    year: {
      type: Number,
    },
    quarter: {
      type: Number,
      min: 1,
      max: 4,
    },
    title: {
      type: String,
      required: true,
    },
    intro: {
      type: String,
    },
    thankYouMessage: {
      type: String,
    },
    questions: {
      type: [questionSchema],
      required: true,
      default: [],
    },
    displayFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    displayTo: {
      type: Date,
    },
    repromptIntervalHours: {
      type: Number,
      required: true,
      default: 24,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

questionnaireSchema.index({ status: 1, displayFrom: -1, tenantId: 1 });

export default questionnaireSchema;
