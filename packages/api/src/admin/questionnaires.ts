import { logger, QuestionnaireValidationError } from '@librechat/data-schemas';
import type {
  IQuestionnaire,
  QuestionnaireInput,
  QuestionnaireStatus,
  QuestionnaireSummary,
} from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

export interface AdminQuestionnairesDeps {
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
}

function inputFrom(body: unknown): QuestionnaireInput {
  const source = (body ?? {}) as Record<string, unknown>;
  return {
    label: source.label as string | undefined,
    status: source.status as QuestionnaireStatus | undefined,
    title: source.title as string,
    intro: source.intro as string | undefined,
    thankYouMessage: source.thankYouMessage as string | undefined,
    questions: source.questions as QuestionnaireInput['questions'],
    displayFrom: source.displayFrom as string | undefined,
    displayTo: source.displayTo as string | null | undefined,
    repromptIntervalHours: source.repromptIntervalHours as number | undefined,
  };
}

export function createAdminQuestionnairesHandlers(deps: AdminQuestionnairesDeps): {
  listQuestionnaires: (req: ServerRequest, res: Response) => Promise<Response>;
  getQuestionnaire: (req: ServerRequest, res: Response) => Promise<Response>;
  createQuestionnaire: (req: ServerRequest, res: Response) => Promise<Response>;
  updateQuestionnaire: (req: ServerRequest, res: Response) => Promise<Response>;
  setStatus: (req: ServerRequest, res: Response) => Promise<Response>;
  duplicateQuestionnaire: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteQuestionnaire: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  async function listQuestionnairesHandler(_req: ServerRequest, res: Response) {
    try {
      const questionnaires = await deps.listQuestionnaires();
      return res.status(200).json({ questionnaires, total: questionnaires.length });
    } catch (error) {
      logger.error('[adminQuestionnaires] listQuestionnaires error:', error);
      return res.status(500).json({ error: 'Failed to list questionnaires' });
    }
  }

  async function getQuestionnaireHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const questionnaire = await deps.getQuestionnaireById(id);
      if (!questionnaire) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      return res.status(200).json({ questionnaire });
    } catch (error) {
      logger.error('[adminQuestionnaires] getQuestionnaire error:', error);
      return res.status(500).json({ error: 'Failed to fetch questionnaire' });
    }
  }

  async function createQuestionnaireHandler(req: ServerRequest, res: Response) {
    try {
      const questionnaire = await deps.saveQuestionnaire(inputFrom(req.body));
      return res.status(201).json({ questionnaire });
    } catch (error) {
      if (error instanceof QuestionnaireValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logger.error('[adminQuestionnaires] createQuestionnaire error:', error);
      return res.status(500).json({ error: 'Failed to create questionnaire' });
    }
  }

  async function updateQuestionnaireHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const existing = await deps.getQuestionnaireById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      const questionnaire = await deps.saveQuestionnaire(inputFrom(req.body), id);
      return res.status(200).json({ questionnaire });
    } catch (error) {
      if (error instanceof QuestionnaireValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logger.error('[adminQuestionnaires] updateQuestionnaire error:', error);
      return res.status(500).json({ error: 'Failed to update questionnaire' });
    }
  }

  async function setStatusHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { status } = (req.body ?? {}) as { status?: QuestionnaireStatus };
      if (!status) {
        return res.status(400).json({ error: '"status" is required' });
      }
      const questionnaire = await deps.setQuestionnaireStatus(id, status);
      if (!questionnaire) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      return res.status(200).json({ questionnaire });
    } catch (error) {
      if (error instanceof QuestionnaireValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logger.error('[adminQuestionnaires] setStatus error:', error);
      return res.status(500).json({ error: 'Failed to update status' });
    }
  }

  async function duplicateQuestionnaireHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const questionnaire = await deps.duplicateQuestionnaire(id);
      if (!questionnaire) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      return res.status(201).json({ questionnaire });
    } catch (error) {
      logger.error('[adminQuestionnaires] duplicateQuestionnaire error:', error);
      return res.status(500).json({ error: 'Failed to duplicate questionnaire' });
    }
  }

  async function deleteQuestionnaireHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const force = req.query.force === 'true';
      const deleted = await deps.deleteQuestionnaire(id, { force });
      if (!deleted) {
        return res.status(404).json({ error: 'Questionnaire not found' });
      }
      return res.status(200).json({ message: 'Questionnaire deleted successfully' });
    } catch (error) {
      if (error instanceof QuestionnaireValidationError) {
        return res.status(409).json({ error: error.message });
      }
      logger.error('[adminQuestionnaires] deleteQuestionnaire error:', error);
      return res.status(500).json({ error: 'Failed to delete questionnaire' });
    }
  }

  return {
    listQuestionnaires: listQuestionnairesHandler,
    getQuestionnaire: getQuestionnaireHandler,
    createQuestionnaire: createQuestionnaireHandler,
    updateQuestionnaire: updateQuestionnaireHandler,
    setStatus: setStatusHandler,
    duplicateQuestionnaire: duplicateQuestionnaireHandler,
    deleteQuestionnaire: deleteQuestionnaireHandler,
  };
}
