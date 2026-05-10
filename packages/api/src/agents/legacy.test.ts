import { EToolResources } from 'librechat-data-provider';
import { convertOcrToContextInPlace, mergeAgentOcrConversion } from './legacy';
import type { AgentToolResources, TFile } from 'librechat-data-provider';

describe('OCR to Context Conversion for updateAgentHandler', () => {
  describe('convertOcrToContextInPlace', () => {
    it('should do nothing when no OCR resource exists', () => {
      const data = {
        tool_resources: {
          [EToolResources.execute_code]: {
            file_ids: ['file1'],
          },
        },
        tools: ['execute_code'],
      };

      const originalCopy = JSON.parse(JSON.stringify(data));
      convertOcrToContextInPlace(data);

      expect(data).toEqual(originalCopy);
    });

    it('should convert OCR to context when context does not exist', () => {
      const data = {
        tool_resources: {
          [EToolResources.ocr]: {
            file_ids: ['ocr1', 'ocr2'],
            files: [
              {
                file_id: 'ocr1',
                filename: 'doc.pdf',
                filepath: '/doc.pdf',
                type: 'application/pdf',
                user: 'user1',
                object: 'file' as const,
                bytes: 1024,
                embedded: false,
                usage: 0,
              },
            ],
          },
        } as AgentToolResources,
      };

      convertOcrToContextInPlace(data);

      expect(data.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(data.tool_resources?.[EToolResources.context]).toEqual({
        file_ids: ['ocr1', 'ocr2'],
        files: [
          {
            file_id: 'ocr1',
            filename: 'doc.pdf',
            filepath: '/doc.pdf',
            type: 'application/pdf',
            user: 'user1',
            object: 'file',
            bytes: 1024,
            embedded: false,
            usage: 0,
          },
        ],
      });
    });

    it('should merge OCR into existing context', () => {
      const data = {
        tool_resources: {
          [EToolResources.context]: {
            file_ids: ['context1'],
            files: [
              {
                file_id: 'context1',
                filename: 'existing.txt',
                filepath: '/existing.txt',
                type: 'text/plain',
                user: 'user1',
                object: 'file' as const,
                bytes: 256,
                embedded: false,
                usage: 0,
              },
            ],
          },
          [EToolResources.ocr]: {
            file_ids: ['ocr1', 'ocr2'],
            files: [
              {
                file_id: 'ocr1',
                filename: 'scan.pdf',
                filepath: '/scan.pdf',
                type: 'application/pdf',
                user: 'user1',
                object: 'file' as const,
                bytes: 1024,
                embedded: false,
                usage: 0,
              },
            ],
          },
        },
      };

      convertOcrToContextInPlace(data);

      expect(data.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(data.tool_resources?.[EToolResources.context]?.file_ids).toEqual([
        'context1',
        'ocr1',
        'ocr2',
      ]);
      expect(data.tool_resources?.[EToolResources.context]?.files).toHaveLength(2);
      expect(data.tool_resources?.[EToolResources.context]?.files?.map((f) => f.file_id)).toEqual([
        'context1',
        'ocr1',
      ]);
    });

    it('should deduplicate file_ids when merging', () => {
      const data = {
        tool_resources: {
          [EToolResources.context]: {
            file_ids: ['file1', 'file2'],
          },
          [EToolResources.ocr]: {
            file_ids: ['file2', 'file3'],
          },
        },
      };

      convertOcrToContextInPlace(data);

      expect(data.tool_resources?.[EToolResources.context]?.file_ids).toEqual([
        'file1',
        'file2',
        'file3',
      ]);
    });

    it('should deduplicate files by file_id when merging', () => {
      const sharedFile: TFile = {
        file_id: 'shared',
        filename: 'shared.txt',
        filepath: '/shared.txt',
        type: 'text/plain',
        user: 'user1',
        object: 'file',
        bytes: 256,
        embedded: false,
        usage: 0,
      };

      const data = {
        tool_resources: {
          [EToolResources.context]: {
            files: [sharedFile],
          },
          [EToolResources.ocr]: {
            files: [
              sharedFile,
              {
                file_id: 'unique',
                filename: 'unique.pdf',
                filepath: '/unique.pdf',
                type: 'application/pdf',
                user: 'user1',
                object: 'file' as const,
                bytes: 1024,
                embedded: false,
                usage: 0,
              },
            ],
          },
        },
      };

      convertOcrToContextInPlace(data);

      expect(data.tool_resources?.[EToolResources.context]?.files).toHaveLength(2);
      expect(
        data.tool_resources?.[EToolResources.context]?.files?.map((f) => f.file_id).sort(),
      ).toEqual(['shared', 'unique']);
    });

    it('should replace OCR with context in tools array', () => {
      const data = {
        tools: ['execute_code', 'ocr', 'file_search'],
      };

      convertOcrToContextInPlace(data);

      expect(data.tools).toEqual(['execute_code', 'context', 'file_search']);
    });

    it('should remove duplicates when context already exists in tools', () => {
      const data = {
        tools: ['context', 'ocr', 'execute_code'],
      };

      convertOcrToContextInPlace(data);

      expect(data.tools).toEqual(['context', 'execute_code']);
    });

    it('should handle both tool_resources and tools conversion', () => {
      const data = {
        tool_resources: {
          [EToolResources.ocr]: {
            file_ids: ['ocr1'],
          },
        } as AgentToolResources,
        tools: ['ocr', 'execute_code'],
      };

      convertOcrToContextInPlace(data);

      expect(data.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(data.tool_resources?.[EToolResources.context]).toEqual({
        file_ids: ['ocr1'],
      });
      expect(data.tools).toEqual(['context', 'execute_code']);
    });

    it('should preserve other tool resources during OCR conversion', () => {
      const data = {
        tool_resources: {
          [EToolResources.execute_code]: {
            file_ids: ['exec1', 'exec2'],
            files: [
              {
                file_id: 'exec1',
                filename: 'script.py',
                filepath: '/script.py',
                type: 'text/x-python',
                user: 'user1',
                object: 'file' as const,
                bytes: 512,
                embedded: false,
                usage: 0,
              },
            ],
          },
          [EToolResources.file_search]: {
            file_ids: ['search1'],
            vector_store_ids: ['vector1', 'vector2'],
          },
          [EToolResources.ocr]: {
            file_ids: ['ocr1'],
          },
        } as AgentToolResources,
        tools: ['execute_code', 'file_search', 'ocr'],
      };

      const originalExecuteCode = JSON.parse(JSON.stringify(data.tool_resources.execute_code));
      const originalFileSearch = JSON.parse(JSON.stringify(data.tool_resources.file_search));

      convertOcrToContextInPlace(data);

      // OCR should be converted to context
      expect(data.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(data.tool_resources?.[EToolResources.context]).toEqual({
        file_ids: ['ocr1'],
      });

      // Other resources should remain unchanged
      expect(data.tool_resources?.[EToolResources.execute_code]).toEqual(originalExecuteCode);
      expect(data.tool_resources?.[EToolResources.file_search]).toEqual(originalFileSearch);

      // Tools array should have ocr replaced with context
      expect(data.tools).toEqual(['execute_code', 'file_search', 'context']);
    });

    it('should preserve image_edit resource during OCR conversion', () => {
      const data = {
        tool_resources: {
          [EToolResources.image_edit]: {
            file_ids: ['image1'],
            files: [
              {
                file_id: 'image1',
                filename: 'photo.png',
                filepath: '/photo.png',
                type: 'image/png',
                user: 'user1',
                object: 'file' as const,
                bytes: 2048,
                embedded: false,
                usage: 0,
                width: 800,
                height: 600,
              },
            ],
          },
          [EToolResources.ocr]: {
            file_ids: ['ocr1'],
          },
        } as AgentToolResources,
      };

      const originalImageEdit = JSON.parse(JSON.stringify(data.tool_resources.image_edit));

      convertOcrToContextInPlace(data);

      expect(data.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(data.tool_resources?.[EToolResources.context]).toEqual({
        file_ids: ['ocr1'],
      });
      expect(data.tool_resources?.[EToolResources.image_edit]).toEqual(originalImageEdit);
    });
  });

  describe('mergeAgentOcrConversion', () => {
    it('should return empty object when existing agent has no OCR', () => {
      const existingAgent = {
        tool_resources: {
          [EToolResources.execute_code]: {
            file_ids: ['file1'],
          },
        },
        tools: ['execute_code'],
      };

      const updateData = {
        tool_resources: {
          [EToolResources.context]: {
            file_ids: ['context1'],
          },
        },
      };

      const result = mergeAgentOcrConversion(existingAgent, updateData);

      expect(result).toEqual({});
    });

    it('should convert existing OCR to context when no context exists', () => {
      const existingAgent = {
        tool_resources: {
          [EToolResources.ocr]: {
            file_ids: ['ocr1', 'ocr2'],
            files: [
              {
                file_id: 'ocr1',
                filename: 'doc.pdf',
                filepath: '/doc.pdf',
                type: 'application/pdf',
                user: 'user1',
                object: 'file' as const,
                bytes: 1024,
                embedded: false,
                usage: 0,
              },
            ],
          },
        },
        tools: ['ocr', 'execute_code'],
      };

      const updateData = {};

      const result = mergeAgentOcrConversion(existingAgent, updateData);

      expect(result.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(result.tool_resources?.[EToolResources.context]).toEqual({
        file_ids: ['ocr1', 'ocr2'],
        files: [
          {
            file_id: 'ocr1',
            filename: 'doc.pdf',
            filepath: '/doc.pdf',
            type: 'application/pdf',
            user: 'user1',
            object: 'file',
            bytes: 1024,
            embedded: false,
            usage: 0,
          },
        ],
      });
      expect(result.tools).toEqual(['context', 'execute_code']);
    });

    it('should merge existing OCR with existing context', () => {
      const existingAgent = {
        tool_resources: {
          [EToolResources.context]: {
            file_ids: ['context1'],
          },
          [EToolResources.ocr]: {
            file_ids: ['ocr1'],
          },
        },
      };

      const updateData = {};

      const result = mergeAgentOcrConversion(existingAgent, updateData);

      expect(result.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(result.tool_resources?.[EToolResources.context]?.file_ids).toEqual([
        'context1',
        'ocr1',
      ]);
    });

    it('should merge converted context with updateData context', () => {
      const existingAgent = {
        tool_resources: {
          [EToolResources.ocr]: {
            file_ids: ['ocr1'],
          },
        },
      };

      const updateData = {
        tool_resources: {
          [EToolResources.context]: {
            file_ids: ['update-context1'],
          },
        },
      };

      const result = mergeAgentOcrConversion(existingAgent, updateData);

      expect(result.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(result.tool_resources?.[EToolResources.context]?.file_ids?.sort()).toEqual([
        'ocr1',
        'update-context1',
      ]);
    });

    it('should handle complex merge with files and file_ids', () => {
      const existingAgent = {
        tool_resources: {
          [EToolResources.context]: {
            file_ids: ['context1'],
            files: [
              {
                file_id: 'context1',
                filename: 'existing.txt',
                filepath: '/existing.txt',
                type: 'text/plain',
                user: 'user1',
                object: 'file' as const,
                bytes: 256,
                embedded: false,
                usage: 0,
              },
            ],
          },
          [EToolResources.ocr]: {
            file_ids: ['ocr1', 'ocr2'],
            files: [
              {
                file_id: 'ocr1',
                filename: 'scan.pdf',
                filepath: '/scan.pdf',
                type: 'application/pdf',
                user: 'user1',
                object: 'file' as const,
                bytes: 1024,
                embedded: false,
                usage: 0,
              },
            ],
          },
        },
        tools: ['context', 'ocr'],
      };

      const updateData = {
        tool_resources: {
          [EToolResources.context]: {
            file_ids: ['update1'],
            files: [
              {
                file_id: 'update1',
                filename: 'update.txt',
                filepath: '/update.txt',
                type: 'text/plain',
                user: 'user1',
                object: 'file' as const,
                bytes: 512,
                embedded: false,
                usage: 0,
              },
            ],
          },
        },
      };

      const result = mergeAgentOcrConversion(existingAgent, updateData);

      expect(result.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(result.tool_resources?.[EToolResources.context]?.file_ids?.sort()).toEqual([
        'context1',
        'ocr1',
        'ocr2',
        'update1',
      ]);
      expect(result.tool_resources?.[EToolResources.context]?.files).toHaveLength(3);
      expect(result.tools).toEqual(['context']);
    });

    it('should not mutate original objects', () => {
      const existingAgent = {
        tool_resources: {
          [EToolResources.ocr]: {
            file_ids: ['ocr1'],
          },
        },
        tools: ['ocr'],
      };

      const updateData = {
        tool_resources: {
          [EToolResources.context]: {
            file_ids: ['context1'],
          },
        },
      };

      const existingCopy = JSON.parse(JSON.stringify(existingAgent));
      const updateCopy = JSON.parse(JSON.stringify(updateData));

      mergeAgentOcrConversion(existingAgent, updateData);

      expect(existingAgent).toEqual(existingCopy);
      expect(updateData).toEqual(updateCopy);
    });

    it('should preserve other tool resources in existing agent during merge', () => {
      const existingAgent = {
        tool_resources: {
          [EToolResources.execute_code]: {
            file_ids: ['exec1', 'exec2'],
            files: [
              {
                file_id: 'exec1',
                filename: 'script.py',
                filepath: '/script.py',
                type: 'text/x-python',
                user: 'user1',
                object: 'file' as const,
                bytes: 512,
                embedded: false,
                usage: 0,
              },
            ],
          },
          [EToolResources.file_search]: {
            file_ids: ['search1'],
            vector_store_ids: ['vector1', 'vector2'],
          },
          [EToolResources.ocr]: {
            file_ids: ['ocr1'],
          },
        },
        tools: ['execute_code', 'file_search', 'ocr'],
      };

      const updateData = {
        tool_resources: {
          [EToolResources.context]: {
            file_ids: ['new-context1'],
          },
        },
      };

      const originalExecuteCode = JSON.parse(
        JSON.stringify(existingAgent.tool_resources.execute_code),
      );
      const originalFileSearch = JSON.parse(
        JSON.stringify(existingAgent.tool_resources.file_search),
      );

      const result = mergeAgentOcrConversion(existingAgent, updateData);

      // OCR should be converted to context and merged with updateData context
      expect(result.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(result.tool_resources?.[EToolResources.context]?.file_ids?.sort()).toEqual([
        'new-context1',
        'ocr1',
      ]);

      // Other resources should be preserved
      expect(result.tool_resources?.[EToolResources.execute_code]).toEqual(originalExecuteCode);
      expect(result.tool_resources?.[EToolResources.file_search]).toEqual(originalFileSearch);

      // Tools should have ocr replaced with context
      expect(result.tools).toEqual(['execute_code', 'file_search', 'context']);
    });

    it('should not affect updateData tool resources that are not context', () => {
      const existingAgent = {
        tool_resources: {
          [EToolResources.ocr]: {
            file_ids: ['ocr1'],
          },
        },
        tools: ['ocr'],
      };

      const updateData = {
        tool_resources: {
          [EToolResources.execute_code]: {
            file_ids: ['update-exec1'],
          },
          [EToolResources.file_search]: {
            file_ids: ['update-search1'],
            vector_store_ids: ['update-vector1'],
          },
        },
        tools: ['execute_code', 'file_search'],
      };

      const originalUpdateData = JSON.parse(JSON.stringify(updateData));

      const result = mergeAgentOcrConversion(existingAgent, updateData);

      // OCR should be converted to context
      expect(result.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(result.tool_resources?.[EToolResources.context]).toEqual({
        file_ids: ['ocr1'],
      });

      // UpdateData's other resources should not be affected
      expect(updateData.tool_resources?.[EToolResources.execute_code]).toEqual(
        originalUpdateData.tool_resources.execute_code,
      );
      expect(updateData.tool_resources?.[EToolResources.file_search]).toEqual(
        originalUpdateData.tool_resources.file_search,
      );

      // Result should only have the converted OCR resources and tools
      expect(result.tools).toEqual(['context']);
    });

    it('should handle all tool resources together', () => {
      const existingAgent = {
        tool_resources: {
          [EToolResources.execute_code]: {
            file_ids: ['exec1'],
          },
          [EToolResources.file_search]: {
            file_ids: ['search1'],
            vector_store_ids: ['vector1'],
          },
          [EToolResources.image_edit]: {
            file_ids: ['image1'],
          },
          [EToolResources.context]: {
            file_ids: ['existing-context1'],
          },
          [EToolResources.ocr]: {
            file_ids: ['ocr1', 'ocr2'],
          },
        },
        tools: ['execute_code', 'file_search', 'image_edit', 'context', 'ocr'],
      };

      const updateData = {
        tool_resources: {
          [EToolResources.context]: {
            file_ids: ['update-context1'],
          },
        },
      };

      const result = mergeAgentOcrConversion(existingAgent, updateData);

      // OCR should be merged with existing context and update context
      expect(result.tool_resources?.[EToolResources.ocr]).toBeUndefined();
      expect(result.tool_resources?.[EToolResources.context]?.file_ids?.sort()).toEqual([
        'existing-context1',
        'ocr1',
        'ocr2',
        'update-context1',
      ]);

      // All other resources should be preserved
      expect(result.tool_resources?.[EToolResources.execute_code]).toEqual({
        file_ids: ['exec1'],
      });
      expect(result.tool_resources?.[EToolResources.file_search]).toEqual({
        file_ids: ['search1'],
        vector_store_ids: ['vector1'],
      });
      expect(result.tool_resources?.[EToolResources.image_edit]).toEqual({
        file_ids: ['image1'],
      });

      // Tools should have ocr replaced with context (no duplicates)
      expect(result.tools).toEqual(['execute_code', 'file_search', 'image_edit', 'context']);
    });
  });
});
