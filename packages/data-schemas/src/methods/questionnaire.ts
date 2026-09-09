import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import type {
  IQuestionnaire,
  IQuestionnaireResponse,
  IQuestionnaireDismissal,
  IQuestionnaireAnswer,
  IQuestionnaireQuestion,
  QuestionnaireInput,
  QuestionnaireStatus,
  QuestionnaireSummary,
  IUser,
} from '~/types';
import logger from '~/config/winston';

const QUESTION_TYPES = ['text', 'scale', 'numeric', 'single_choice', 'multiple_choice'];
const STATUSES: QuestionnaireStatus[] = ['draft', 'active', 'closed'];

export class QuestionnaireValidationError extends Error {}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new QuestionnaireValidationError('Invalid date');
  }
  return date;
}

export function validateQuestionnaireQuestions(questions: unknown): IQuestionnaireQuestion[] {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new QuestionnaireValidationError('"questions" must be a non-empty array');
  }

  const seen = new Set<string>();
  for (const question of questions as IQuestionnaireQuestion[]) {
    if (!question?.id || typeof question.id !== 'string') {
      throw new QuestionnaireValidationError('Every question needs a string "id"');
    }
    if (seen.has(question.id)) {
      throw new QuestionnaireValidationError(`Duplicate question id "${question.id}"`);
    }
    seen.add(question.id);

    if (!QUESTION_TYPES.includes(question.type)) {
      throw new QuestionnaireValidationError(
        `Question "${question.id}" has invalid type "${question.type}". Must be one of: ${QUESTION_TYPES.join(', ')}`,
      );
    }
    if (!question.title || typeof question.title !== 'string') {
      throw new QuestionnaireValidationError(`Question "${question.id}" is missing a "title"`);
    }
    if (question.type === 'single_choice' || question.type === 'multiple_choice') {
      if (!Array.isArray(question.options) || question.options.length === 0) {
        throw new QuestionnaireValidationError(
          `Question "${question.id}" of type "${question.type}" needs a non-empty "options" array`,
        );
      }
    }
    if (
      question.min != null &&
      question.max != null &&
      Number(question.min) >= Number(question.max)
    ) {
      throw new QuestionnaireValidationError(
        `Question "${question.id}" needs "max" greater than "min"`,
      );
    }
  }

  return questions as IQuestionnaireQuestion[];
}

export function createQuestionnaireMethods(mongoose: typeof import('mongoose')): {
  getActiveQuestionnaire: (user?: IUser | null) => Promise<{
    questionnaire: IQuestionnaire | null;
    completed: boolean;
    dismissedAt: Date | null;
  }>;
  submitQuestionnaireResponse: (
    userId: string,
    questionnaireId: string,
    answers: IQuestionnaireAnswer[],
  ) => Promise<IQuestionnaireResponse>;
  dismissQuestionnaire: (
    userId: string,
    questionnaireId: string,
  ) => Promise<IQuestionnaireDismissal>;
  listQuestionnaires: () => Promise<QuestionnaireSummary[]>;
  getQuestionnaireById: (questionnaireId: string) => Promise<IQuestionnaire | null>;
  saveQuestionnaire: (
    input: QuestionnaireInput,
    questionnaireId?: string,
  ) => Promise<IQuestionnaire>;
  setQuestionnaireStatus: (
    questionnaireId: string,
    status: QuestionnaireStatus,
  ) => Promise<IQuestionnaire | null>;
  duplicateQuestionnaire: (questionnaireId: string) => Promise<IQuestionnaire | null>;
  deleteQuestionnaire: (
    questionnaireId: string,
    options?: { force?: boolean },
  ) => Promise<IQuestionnaire | null>;
} {
  async function getActiveQuestionnaire(user?: IUser | null): Promise<{
    questionnaire: IQuestionnaire | null;
    completed: boolean;
    dismissedAt: Date | null;
  }> {
    try {
      const Questionnaire = mongoose.models.Questionnaire as Model<IQuestionnaire>;
      const now = new Date();
      const questionnaire = (await Questionnaire.findOne({
        status: 'active',
        displayFrom: { $lte: now },
        $or: [{ displayTo: { $gte: now } }, { displayTo: null }],
      })
        .sort({ displayFrom: -1 })
        .lean()) as IQuestionnaire | null;

      if (!questionnaire || !user) {
        return { questionnaire, completed: false, dismissedAt: null };
      }

      const userId = new mongoose.Types.ObjectId(user._id?.toString?.() ?? String(user._id));

      const QuestionnaireResponse = mongoose.models
        .QuestionnaireResponse as Model<IQuestionnaireResponse>;
      const QuestionnaireDismissal = mongoose.models
        .QuestionnaireDismissal as Model<IQuestionnaireDismissal>;

      const [existingResponse, existingDismissal] = await Promise.all([
        QuestionnaireResponse.findOne({
          questionnaireId: questionnaire.questionnaireId,
          user: userId,
        }).lean(),
        QuestionnaireDismissal.findOne({
          questionnaireId: questionnaire.questionnaireId,
          user: userId,
        }).lean(),
      ]);

      return {
        questionnaire,
        completed: existingResponse != null,
        dismissedAt: (existingDismissal as IQuestionnaireDismissal | null)?.dismissedAt ?? null,
      };
    } catch (error) {
      logger.error('[getActiveQuestionnaire] Error getting questionnaire', error);
      throw new Error('Error getting questionnaire');
    }
  }

  async function submitQuestionnaireResponse(
    userId: string,
    questionnaireId: string,
    answers: IQuestionnaireAnswer[],
  ): Promise<IQuestionnaireResponse> {
    const QuestionnaireResponse = mongoose.models
      .QuestionnaireResponse as Model<IQuestionnaireResponse>;
    try {
      return await QuestionnaireResponse.create({
        questionnaireId,
        user: new mongoose.Types.ObjectId(userId),
        answers,
        submittedAt: new Date(),
      });
    } catch (error) {
      const mongoError = error as { code?: number };
      if (mongoError.code === 11000) {
        throw new Error('You have already responded to this questionnaire');
      }
      logger.error('[submitQuestionnaireResponse] Error submitting response', error);
      throw new Error('Error submitting questionnaire response');
    }
  }

  async function dismissQuestionnaire(
    userId: string,
    questionnaireId: string,
  ): Promise<IQuestionnaireDismissal> {
    const QuestionnaireDismissal = mongoose.models
      .QuestionnaireDismissal as Model<IQuestionnaireDismissal>;
    try {
      return (await QuestionnaireDismissal.findOneAndUpdate(
        { questionnaireId, user: new mongoose.Types.ObjectId(userId) },
        { $set: { dismissedAt: new Date() } },
        { new: true, upsert: true },
      )) as IQuestionnaireDismissal;
    } catch (error) {
      logger.error('[dismissQuestionnaire] Error dismissing questionnaire', error);
      throw new Error('Error dismissing questionnaire');
    }
  }

  function models() {
    return {
      Questionnaire: mongoose.models.Questionnaire as Model<IQuestionnaire>,
      QuestionnaireResponse: mongoose.models.QuestionnaireResponse as Model<IQuestionnaireResponse>,
      QuestionnaireDismissal: mongoose.models
        .QuestionnaireDismissal as Model<IQuestionnaireDismissal>,
    };
  }

  async function closeOtherActive(keepId: string): Promise<number> {
    const { Questionnaire } = models();
    const result = await Questionnaire.updateMany(
      { questionnaireId: { $ne: keepId }, status: 'active' },
      { $set: { status: 'closed' } },
    );
    return result.modifiedCount ?? 0;
  }

  function normalize(input: QuestionnaireInput) {
    if (!input?.title || typeof input.title !== 'string' || !input.title.trim()) {
      throw new QuestionnaireValidationError('"title" is required');
    }

    const questions = validateQuestionnaireQuestions(input.questions);
    const displayFrom = parseDate(input.displayFrom) ?? new Date();
    const displayTo = parseDate(input.displayTo);

    if (displayTo && displayTo <= displayFrom) {
      throw new QuestionnaireValidationError('"displayTo" must be after "displayFrom"');
    }

    let repromptIntervalHours: number | null;
    if (input.repromptIntervalHours === null) {
      repromptIntervalHours = null;
    } else {
      repromptIntervalHours = input.repromptIntervalHours ?? 24;
      if (!Number.isFinite(repromptIntervalHours) || repromptIntervalHours < 1) {
        throw new QuestionnaireValidationError(
          '"repromptIntervalHours" must be a positive number, or null for permanent dismiss',
        );
      }
    }

    if (input.status && !STATUSES.includes(input.status)) {
      throw new QuestionnaireValidationError(`"status" must be one of: ${STATUSES.join(', ')}`);
    }

    const dismissible = input.dismissible !== false;
    const showConfetti = input.showConfetti !== false;

    if (!dismissible && repromptIntervalHours === null) {
      repromptIntervalHours = 24;
    }

    const year = displayFrom.getFullYear();
    const quarter = Math.floor(displayFrom.getMonth() / 3) + 1;

    return {
      label: input.label?.trim() || `Q${quarter} ${year}`,
      title: input.title.trim(),
      intro: input.intro?.trim() || undefined,
      thankYouMessage: input.thankYouMessage?.trim() || undefined,
      questions,
      displayFrom,
      displayTo,
      dismissible,
      repromptIntervalHours,
      showConfetti,
      year,
      quarter,
    };
  }

  async function listQuestionnaires(): Promise<QuestionnaireSummary[]> {
    try {
      const { Questionnaire, QuestionnaireResponse, QuestionnaireDismissal } = models();
      const questionnaires = await Questionnaire.find()
        .sort({ year: -1, quarter: -1, displayFrom: -1 })
        .lean();

      if (questionnaires.length === 0) {
        return [];
      }

      const ids = questionnaires.map((q) => q.questionnaireId);
      const [responses, dismissals] = await Promise.all([
        QuestionnaireResponse.aggregate<{ _id: string; count: number }>([
          { $match: { questionnaireId: { $in: ids } } },
          { $group: { _id: '$questionnaireId', count: { $sum: 1 } } },
        ]),
        QuestionnaireDismissal.aggregate<{ _id: string; count: number }>([
          { $match: { questionnaireId: { $in: ids } } },
          { $group: { _id: '$questionnaireId', count: { $sum: 1 } } },
        ]),
      ]);

      const responseCounts = new Map(responses.map((r) => [r._id, r.count]));
      const dismissalCounts = new Map(dismissals.map((d) => [d._id, d.count]));

      return questionnaires.map((questionnaire) => ({
        questionnaireId: questionnaire.questionnaireId,
        label: questionnaire.label,
        status: questionnaire.status ?? 'draft',
        year: questionnaire.year,
        quarter: questionnaire.quarter,
        title: questionnaire.title,
        questionCount: questionnaire.questions?.length ?? 0,
        displayFrom: questionnaire.displayFrom,
        displayTo: questionnaire.displayTo ?? null,
        dismissible: questionnaire.dismissible !== false,
        repromptIntervalHours: questionnaire.repromptIntervalHours ?? null,
        showConfetti: questionnaire.showConfetti !== false,
        responseCount: responseCounts.get(questionnaire.questionnaireId) ?? 0,
        dismissalCount: dismissalCounts.get(questionnaire.questionnaireId) ?? 0,
        createdAt: (questionnaire as { createdAt?: Date }).createdAt,
        updatedAt: (questionnaire as { updatedAt?: Date }).updatedAt,
      }));
    } catch (error) {
      logger.error('[listQuestionnaires] Error listing questionnaires', error);
      throw new Error('Error listing questionnaires');
    }
  }

  async function getQuestionnaireById(questionnaireId: string): Promise<IQuestionnaire | null> {
    const { Questionnaire } = models();
    return (await Questionnaire.findOne({ questionnaireId }).lean()) as IQuestionnaire | null;
  }

  async function saveQuestionnaire(
    input: QuestionnaireInput,
    questionnaireId?: string,
  ): Promise<IQuestionnaire> {
    const { Questionnaire } = models();
    const data = normalize(input);

    const existing = questionnaireId
      ? await Questionnaire.findOne({ questionnaireId }).lean()
      : null;
    if (questionnaireId && !existing) {
      throw new QuestionnaireValidationError(`No questionnaire found with id "${questionnaireId}"`);
    }

    const status = input.status ?? existing?.status ?? 'draft';
    const saved = existing
      ? ((await Questionnaire.findOneAndUpdate(
          { questionnaireId },
          { $set: { ...data, status } },
          { new: true },
        ).lean()) as IQuestionnaire)
      : ((
          await Questionnaire.create({ ...data, status, questionnaireId: randomUUID() })
        ).toObject() as IQuestionnaire);

    if (status === 'active') {
      await closeOtherActive(saved.questionnaireId);
    }

    return saved;
  }

  async function setQuestionnaireStatus(
    questionnaireId: string,
    status: QuestionnaireStatus,
  ): Promise<IQuestionnaire | null> {
    if (!STATUSES.includes(status)) {
      throw new QuestionnaireValidationError(`"status" must be one of: ${STATUSES.join(', ')}`);
    }

    const { Questionnaire } = models();
    const updated = (await Questionnaire.findOneAndUpdate(
      { questionnaireId },
      { $set: { status } },
      { new: true },
    ).lean()) as IQuestionnaire | null;

    if (updated && status === 'active') {
      await closeOtherActive(questionnaireId);
    }

    return updated;
  }

  async function duplicateQuestionnaire(questionnaireId: string): Promise<IQuestionnaire | null> {
    const { Questionnaire } = models();
    const source = await Questionnaire.findOne({ questionnaireId }).lean();
    if (!source) {
      return null;
    }

    const displayFrom = new Date(source.displayFrom);
    displayFrom.setMonth(displayFrom.getMonth() + 3);

    let displayTo: Date | null = null;
    if (source.displayTo) {
      displayTo = new Date(source.displayTo);
      displayTo.setMonth(displayTo.getMonth() + 3);
    }

    const created = await Questionnaire.create({
      questionnaireId: randomUUID(),
      label: `Q${Math.floor(displayFrom.getMonth() / 3) + 1} ${displayFrom.getFullYear()}`,
      status: 'draft',
      year: displayFrom.getFullYear(),
      quarter: Math.floor(displayFrom.getMonth() / 3) + 1,
      title: source.title,
      intro: source.intro,
      thankYouMessage: source.thankYouMessage,
      questions: source.questions,
      displayFrom,
      displayTo,
      dismissible: source.dismissible !== false,
      repromptIntervalHours: source.repromptIntervalHours ?? 24,
      showConfetti: source.showConfetti !== false,
    });

    return created.toObject() as IQuestionnaire;
  }

  async function deleteQuestionnaire(
    questionnaireId: string,
    options?: { force?: boolean },
  ): Promise<IQuestionnaire | null> {
    const { Questionnaire, QuestionnaireResponse, QuestionnaireDismissal } = models();
    const force = options?.force === true;

    const responseCount = await QuestionnaireResponse.countDocuments({ questionnaireId });
    if (responseCount > 0 && !force) {
      throw new QuestionnaireValidationError(
        `This questionnaire has ${responseCount} response(s). Close it instead, or confirm deletion to discard them.`,
      );
    }

    const deleted = (await Questionnaire.findOneAndDelete({
      questionnaireId,
    }).lean()) as IQuestionnaire | null;
    if (!deleted) {
      return null;
    }

    if (force) {
      await Promise.all([
        QuestionnaireResponse.deleteMany({ questionnaireId }),
        QuestionnaireDismissal.deleteMany({ questionnaireId }),
      ]);
    }

    return deleted;
  }

  return {
    getActiveQuestionnaire,
    submitQuestionnaireResponse,
    dismissQuestionnaire,
    listQuestionnaires,
    getQuestionnaireById,
    saveQuestionnaire,
    setQuestionnaireStatus,
    duplicateQuestionnaire,
    deleteQuestionnaire,
  };
}

export type QuestionnaireMethods = ReturnType<typeof createQuestionnaireMethods>;
