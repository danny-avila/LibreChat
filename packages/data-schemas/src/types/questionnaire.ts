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
  /** Consecutive questions sharing a section are grouped onto the same page. */
  section?: string;
  /** scale/numeric */
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  /** single_choice/multiple_choice */
  options?: string[];
  maxSelections?: number;
}

/** Only 'active' questionnaires are served to users. */
export type QuestionnaireStatus = 'draft' | 'active' | 'closed';

export interface IQuestionnaire extends Document {
  questionnaireId: string;
  label?: string;
  status: QuestionnaireStatus;
  /** Derived from displayFrom on save. */
  year?: number;
  quarter?: number;
  title: string;
  intro?: string;
  thankYouMessage?: string;
  questions: IQuestionnaireQuestion[];
  displayFrom: Date;
  displayTo?: Date;
  repromptIntervalHours: number;
  tenantId?: string;
}

/** `questionnaireId`/`year`/`quarter` are derived on save. */
export interface QuestionnaireInput {
  label?: string;
  status?: QuestionnaireStatus;
  title: string;
  intro?: string;
  thankYouMessage?: string;
  questions: IQuestionnaireQuestion[];
  displayFrom?: Date | string | null;
  displayTo?: Date | string | null;
  repromptIntervalHours?: number;
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
  repromptIntervalHours: number;
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
