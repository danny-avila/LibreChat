import { z } from 'zod';
import type { AppConfig } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { AgentInstructionPromptProvider } from './resolver';
import { AgentInstructionPromptError } from './resolver';

const querySchema = z.object({
  name: z.string().trim().min(1).max(255),
  version: z.coerce.number().int().positive().optional(),
});

type PromptPreviewRequest = Request & {
  user?: { id?: string; role?: string };
  config?: AppConfig;
};

export function createAgentInstructionPromptPreviewHandler({
  resolver,
}: {
  resolver: AgentInstructionPromptProvider;
}) {
  return async (req: PromptPreviewRequest, res: Response): Promise<Response> => {
    const query = querySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({
        error: {
          code: 'invalid_request',
          message: 'A valid prompt name and optional positive version are required',
        },
      });
    }

    try {
      const { prompt: _prompt, ...result } = await resolver.resolve(
        { source: 'langfuse', name: query.data.name, version: query.data.version },
        {
          userId: req.user?.id ?? '',
          role: req.user?.role,
          appConfig: req.config,
        },
      );
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof AgentInstructionPromptError) {
        return res.status(error.statusCode).json({
          error: { code: error.code, message: error.message, retryable: error.retryable },
        });
      }
      return res.status(502).json({
        error: {
          code: 'retrieval_failed',
          message: 'Langfuse prompt retrieval failed',
          retryable: true,
        },
      });
    }
  };
}
