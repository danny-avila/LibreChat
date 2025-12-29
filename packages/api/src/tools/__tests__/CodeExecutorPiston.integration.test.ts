/**
 * Integration tests for Piston Code Executor
 * These tests verify the complete flow from tool creation to file extraction
 * 
 * Note: These tests use mocked components, not the actual Piston API
 */

import { createPistonCodeExecutionTool } from '../CodeExecutorPiston';
import type { ServerRequest } from '~/types';
import type { TFile } from 'librechat-data-provider';

// Mock dependencies
jest.mock('~/server/services/Piston/PistonClient');
jest.mock('~/server/services/Piston/fileHandlers');
jest.mock('~/server/services/Piston/fileSaver');
jest.mock('~/models/File');

describe('CodeExecutorPiston Integration', () => {
  const mockRequest = {
    user: { id: 'test-user' },
    app: { locals: { fileStrategy: 'local' } },
    config: { fileStrategy: 'local' },
  } as unknown as ServerRequest;

  const mockParams = {
    user_id: 'test-user',
    files: [],
    pistonUrl: 'https://test-piston.com',
    req: mockRequest,
    conversationId: 'test-convo',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Tool Creation', () => {
    it('should create a valid tool with correct schema', () => {
      const tool = createPistonCodeExecutionTool(mockParams);

      expect(tool).toBeDefined();
      expect(tool.name).toBe('execute_code');
      expect(tool.description).toContain('LIBRECHAT_FILE_START');
      expect(tool.description).toContain('marker');
    });

    it('should have correct response format', () => {
      const tool = createPistonCodeExecutionTool(mockParams);
      
      // @ts-ignore - accessing private property for testing
      expect(tool.responseFormat).toBe('content_and_artifact');
    });
  });

  describe('Tool Execution', () => {
    it('should format output correctly', async () => {
      const { PistonClient } = require('~/server/services/Piston/PistonClient');
      const { extractFilesFromStdout } = require('~/server/services/Piston/markerParser');
      const { saveExtractedFiles } = require('~/server/services/Piston/fileSaver');

      // Mock Piston execution
      PistonClient.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue({
          language: 'python',
          version: '3.10.0',
          run: {
            stdout: 'Hello, World!\n',
            stderr: '',
            code: 0,
            signal: null,
            output: 'Hello, World!\n',
          },
        }),
      }));

      // Mock file extraction (no files)
      jest.spyOn(require('~/server/services/Piston/markerParser'), 'extractFilesFromStdout')
        .mockReturnValue({
          cleanedOutput: 'Hello, World!',
          files: [],
        });

      // Mock file saving
      jest.spyOn(require('~/server/services/Piston/fileSaver'), 'saveExtractedFiles')
        .mockResolvedValue([]);

      const tool = createPistonCodeExecutionTool(mockParams);
      const [output, artifact] = await tool.invoke({
        lang: 'python',
        code: 'print("Hello, World!")',
      });

      expect(output).toContain('stdout');
      expect(output).toContain('Hello, World!');
      expect(artifact.files).toEqual([]);
    });

    it('should handle file extraction', async () => {
      const { PistonClient } = require('~/server/services/Piston/PistonClient');
      const mockFile = {
        file_id: 'test-file-id',
        filename: 'output.txt',
        type: 'text/plain',
      };

      PistonClient.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue({
          language: 'python',
          version: '3.10.0',
          run: {
            stdout: '===LIBRECHAT_FILE_START===\noutput.txt\nutf8\nTest content\n===LIBRECHAT_FILE_END===\n',
            stderr: '',
            code: 0,
            signal: null,
            output: '===LIBRECHAT_FILE_START===\noutput.txt\nutf8\nTest content\n===LIBRECHAT_FILE_END===\n',
          },
        }),
      }));

      jest.spyOn(require('~/server/services/Piston/markerParser'), 'extractFilesFromStdout')
        .mockReturnValue({
          cleanedOutput: '',
          files: [{
            filename: 'output.txt',
            encoding: 'utf8',
            content: 'Test content',
          }],
        });

      jest.spyOn(require('~/server/services/Piston/fileSaver'), 'saveExtractedFiles')
        .mockResolvedValue([mockFile]);

      const tool = createPistonCodeExecutionTool(mockParams);
      const [output, artifact] = await tool.invoke({
        lang: 'python',
        code: 'test code',
      });

      expect(output).toContain('Generated files');
      expect(output).toContain('output.txt');
      expect(artifact.files).toHaveLength(1);
      expect(artifact.files[0]).toEqual(mockFile);
    });

    it('should handle execution errors gracefully', async () => {
      const { PistonClient } = require('~/server/services/Piston/PistonClient');

      PistonClient.mockImplementation(() => ({
        execute: jest.fn().mockRejectedValue(new Error('Execution failed')),
      }));

      const tool = createPistonCodeExecutionTool(mockParams);
      const [output, artifact] = await tool.invoke({
        lang: 'python',
        code: 'invalid code',
      });

      expect(output).toContain('Execution error');
      expect(output).toContain('Execution failed');
      expect(artifact.files).toEqual([]);
    });

    it('should include stderr in output', async () => {
      const { PistonClient } = require('~/server/services/Piston/PistonClient');

      PistonClient.mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue({
          language: 'python',
          version: '3.10.0',
          run: {
            stdout: 'output',
            stderr: 'warning: deprecated function',
            code: 0,
            signal: null,
            output: 'output\nwarning: deprecated function',
          },
        }),
      }));

      jest.spyOn(require('~/server/services/Piston/markerParser'), 'extractFilesFromStdout')
        .mockReturnValue({
          cleanedOutput: 'output',
          files: [],
        });

      jest.spyOn(require('~/server/services/Piston/fileSaver'), 'saveExtractedFiles')
        .mockResolvedValue([]);

      const tool = createPistonCodeExecutionTool(mockParams);
      const [output] = await tool.invoke({
        lang: 'python',
        code: 'test',
      });

      expect(output).toContain('stdout');
      expect(output).toContain('stderr');
      expect(output).toContain('warning: deprecated function');
    });
  });
});

