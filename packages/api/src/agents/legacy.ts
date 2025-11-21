import { EToolResources } from 'librechat-data-provider';
import type { AgentToolResources, TFile } from 'librechat-data-provider';

/**
 * Converts OCR tool resource to context tool resource in place.
 * This modifies the input object directly (used for updateData in the handler).
 *
 * @param data - Object containing tool_resources and/or tools to convert
 * @returns void - modifies the input object directly
 */
export function convertOcrToContextInPlace(data: {
  tool_resources?: AgentToolResources;
  tools?: string[];
}): void {
  // Convert OCR to context in tool_resources
  if (data.tool_resources?.ocr) {
    if (!data.tool_resources.context) {
      data.tool_resources.context = data.tool_resources.ocr;
    } else {
      // Merge OCR into existing context
      if (data.tool_resources.ocr?.file_ids?.length) {
        const existingFileIds = data.tool_resources.context.file_ids || [];
        const ocrFileIds = data.tool_resources.ocr.file_ids || [];
        data.tool_resources.context.file_ids = [...new Set([...existingFileIds, ...ocrFileIds])];
      }
      if (data.tool_resources.ocr?.files?.length) {
        const existingFiles = data.tool_resources.context.files || [];
        const ocrFiles = data.tool_resources.ocr.files || [];
        const filesMap = new Map<string, TFile>();
        [...existingFiles, ...ocrFiles].forEach((file) => {
          if (file?.file_id) {
            filesMap.set(file.file_id, file);
          }
        });
        data.tool_resources.context.files = Array.from(filesMap.values());
      }
    }
    delete data.tool_resources.ocr;
  }

  // Convert OCR to context in tools array
  if (data.tools?.includes(EToolResources.ocr)) {
    data.tools = data.tools.map((tool) =>
      tool === EToolResources.ocr ? EToolResources.context : tool,
    );
    data.tools = [...new Set(data.tools)];
  }
}

/**
 * Merges tool resources from existing agent with incoming update data,
 * converting OCR to context and handling deduplication.
 * Used when existing agent has OCR that needs to be converted and merged with updateData.
 *
 * @param existingAgent - The existing agent data
 * @param updateData - The incoming update data
 * @returns Object with merged tool_resources and tools
 */
export function mergeAgentOcrConversion(
  existingAgent: { tool_resources?: AgentToolResources; tools?: string[] },
  updateData: { tool_resources?: AgentToolResources; tools?: string[] },
): { tool_resources?: AgentToolResources; tools?: string[] } {
  if (!existingAgent.tool_resources?.ocr) {
    return {};
  }

  const result: { tool_resources?: AgentToolResources; tools?: string[] } = {};

  // Convert existing agent's OCR to context
  result.tool_resources = { ...existingAgent.tool_resources };

  if (!result.tool_resources.context) {
    // Simple case: no context exists, just move ocr to context
    result.tool_resources.context = result.tool_resources.ocr;
  } else {
    // Merge case: context already exists, merge both file_ids and files arrays

    // Merge file_ids if they exist
    if (result.tool_resources.ocr?.file_ids?.length) {
      const existingFileIds = result.tool_resources.context.file_ids || [];
      const ocrFileIds = result.tool_resources.ocr.file_ids || [];
      result.tool_resources.context.file_ids = [...new Set([...existingFileIds, ...ocrFileIds])];
    }

    // Merge files array if it exists (already fetched files)
    if (result.tool_resources.ocr?.files?.length) {
      const existingFiles = result.tool_resources.context.files || [];
      const ocrFiles = result.tool_resources.ocr?.files || [];
      // Merge and deduplicate by file_id
      const filesMap = new Map<string, TFile>();
      [...existingFiles, ...ocrFiles].forEach((file) => {
        if (file?.file_id) {
          filesMap.set(file.file_id, file);
        }
      });
      result.tool_resources.context.files = Array.from(filesMap.values());
    }
  }

  // Remove the deprecated ocr resource
  delete result.tool_resources.ocr;

  // Update tools array: replace 'ocr' with 'context'
  if (existingAgent.tools?.includes(EToolResources.ocr)) {
    result.tools = existingAgent.tools.map((tool) =>
      tool === EToolResources.ocr ? EToolResources.context : tool,
    );
    // Remove duplicates if context already existed
    result.tools = [...new Set(result.tools)];
  }

  // Merge with any context that might already be in updateData (from incoming OCR conversion)
  if (updateData.tool_resources?.context && result.tool_resources.context) {
    // Merge the contexts
    const mergedContext = { ...result.tool_resources.context };

    // Merge file_ids
    if (updateData.tool_resources.context.file_ids?.length) {
      const existingIds = mergedContext.file_ids || [];
      const newIds = updateData.tool_resources.context.file_ids || [];
      mergedContext.file_ids = [...new Set([...existingIds, ...newIds])];
    }

    // Merge files
    if (updateData.tool_resources.context.files?.length) {
      const existingFiles = mergedContext.files || [];
      const newFiles = updateData.tool_resources.context.files || [];
      const filesMap = new Map<string, TFile>();
      [...existingFiles, ...newFiles].forEach((file) => {
        if (file?.file_id) {
          filesMap.set(file.file_id, file);
        }
      });
      mergedContext.files = Array.from(filesMap.values());
    }

    result.tool_resources.context = mergedContext;
  }

  return result;
}
