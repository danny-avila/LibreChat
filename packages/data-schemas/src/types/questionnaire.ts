import type { Document, Types } from 'mongoose';

export type QuestionnaireQuestionType =
  | 'text'
  | 'scale'
  | 'numeric'
  | 'single_choice'
  | 'multiple_choice';

export interface IQuestionnaireQuestion {
  id: string;
  type: QuestionnaireQuestionType;
  title: string;
  description?: string;
  required?: boolean;
  section?: string;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  options?: string[];
  maxSelections?: number;
}

export type QuestionnaireStatus = 'draft' | 'active' | 'closed';

export interface IQuestionnaire extends Document {
  questionnaireId: string;
  label?: string;
  status: QuestionnaireStatus;
  year?: number;
  quarter?: number;
  title: string;
  intro?: string;
  thankYouMessage?: string;
  questions: IQuestionnaireQuestion[];
  displayFrom: Date;
  displayTo?: Date;
  dismissible: boolean;
  repromptIntervalHours: number | null;
  showConfetti: boolean;
  tenantId?: string;
}

export interface QuestionnaireInput {
  label?: string;
  status?: QuestionnaireStatus;
  title: string;
  intro?: string;
  thankYouMessage?: string;
  questions: IQuestionnaireQuestion[];
  displayFrom?: Date | string | null;
  displayTo?: Date | string | null;
  dismissible?: boolean;
  repromptIntervalHours?: number | null;
  showConfetti?: boolean;
}

export interface QuestionnaireSummary {
  questionnaireId: string;
  label?: string;
  status: QuestionnaireStatus;
  year?: number;
  quarter?: number;
  title: string;
  questionCount: number;
  displayFrom: Date;
  displayTo?: Date | null;
  dismissible: boolean;
  repromptIntervalHours: number | null;
  showConfetti: boolean;
  responseCount: number;
  dismissalCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IQuestionnaireAnswer {
  questionId: string;
  value: string | number | string[];
}

export interface IQuestionnaireResponse extends Document {
  questionnaireId: string;
  user: Types.ObjectId;
  answers: IQuestionnaireAnswer[];
  submittedAt: Date;
  tenantId?: string;
}

export interface IQuestionnaireDismissal extends Document {
  questionnaireId: string;
  user: Types.ObjectId;
  dismissedAt: Date;
  tenantId?: string;
}
