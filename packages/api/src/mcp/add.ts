import { Request, Response } from 'express';
import { logger } from '@librechat/data-schemas';

interface CreateToolRequest extends Request {
  body: {
    name: string;
    description: string;
    type: 'function' | 'code_interpreter' | 'file_search';
    metadata?: Record<string, unknown>;
  };
  user?: {
    id: string;
  };
}

/**
 * Add a new tool to the system
 * @route POST /agents/tools/add
 * @param {object} req.body - Request body containing tool data
 * @param {string} req.body.name - Tool name
 * @param {string} req.body.description - Tool description
 * @param {string} req.body.type - Tool type (function, code_interpreter, file_search)
 * @param {object} [req.body.metadata] - Optional metadata
 * @returns {object} Created tool object
 */
export const addTool = async (req: CreateToolRequest, res: Response) => {
  try {
    const { name, description, type, metadata } = req.body;

    // Log the incoming request for development
    logger.info(
      'Add Tool Request:' +
        JSON.stringify({
          name,
          description,
          type,
          metadata,
          userId: req.user?.id,
        }),
    );

    // Validate required fields
    if (!name || !description || !type) {
      return res.status(400).json({
        error: 'Missing required fields: name, description, and type are required',
      });
    }

    // Validate tool type
    const validTypes = ['function', 'code_interpreter', 'file_search'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: `Invalid tool type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // For now, return a mock successful response
    // TODO: Implement actual tool creation logic
    const mockTool = {
      id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      function: {
        name,
        description,
      },
      metadata: metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    logger.info('Tool created successfully:' + JSON.stringify(mockTool));

    res.status(201).json(mockTool);
  } catch (error) {
    logger.error('Error adding tool:', error);
    res.status(500).json({
      error: 'Internal server error while adding tool',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
