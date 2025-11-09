/**
 * Woodland QA Knowledge Base Tool
 * 
 * This tool wraps LibreChat's existing file_search capability to query
 * the human-validated QA knowledge base. It provides:
 * - High-confidence answers from verified Q&A pairs
 * - Conflict detection when multiple answers exist
 * - Citation to original question IDs
 * 
 * Built on top of LibreChat's RAG infrastructure - no custom vector DB needed!
 */

const { z } = require('zod');
const axios = require('axios');
const { Tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const { generateShortLivedToken } = require('@librechat/api');

class WoodlandQAKnowledge extends Tool {
  constructor(fields = {}) {
    super();
    
    this.name = 'woodland-qa-knowledge';
    this.description = `Search the Woodland QA Knowledge Base for verified answers to common questions. 
This knowledge base contains ~1400 human-validated Q&A pairs and should be consulted FIRST before generating answers.
Use this when:
- Customer asks a question that might have been answered before
- You need to verify part numbers, policies, or technical details
- You want to ensure consistency with past answers
The tool returns the most relevant verified answer with citation.`;

    this.schema = z.object({
      query: z.string().describe('The customer question or search query'),
      k: z.number().int().min(1).max(10).default(3).optional()
        .describe('Number of results to return (default: 3)'),
    });
    
    this.ragApiUrl = process.env.RAG_API_URL;
    this.qaFileId = fields.qaFileId || process.env.WOODLAND_QA_FILE_ID;
    this.entityId = fields.entityId || 'agent_woodland_supervisor';
    this.userId = fields.userId; // Will be set per request
    this.agentFiles = fields.agentFiles || []; // Fallback to agent-uploaded files
    this.useFallbackMode = !this.qaFileId; // Use agent files when no dedicated KB
    
    if (!this.ragApiUrl) {
      logger.warn('[woodland-qa-knowledge] RAG_API_URL not configured - tool will be disabled');
    }
    
    if (!this.qaFileId) {
      logger.info('[woodland-qa-knowledge] WOODLAND_QA_FILE_ID not set - will use agent-uploaded files (fallback mode)');
    }
    
    logger.info('[woodland-qa-knowledge] Initialized', {
      ragApiUrl: this.ragApiUrl ? 'configured' : 'missing',
      qaFileId: this.qaFileId ? 'configured' : 'missing',
      mode: this.useFallbackMode ? 'agent-files' : 'dedicated-kb',
      entityId: this.entityId,
    });
  }
  
  setUserId(userId) {
    this.userId = userId;
  }
  
  setAgentFiles(agentFiles) {
    this.agentFiles = agentFiles || [];
    logger.debug('[woodland-qa-knowledge] Agent files updated', { 
      fileCount: this.agentFiles.length 
    });
  }
  
  async _call({ query, k = 3 }) {
    // Validate configuration
    if (!this.ragApiUrl) {
      return 'QA Knowledge Base search unavailable: RAG_API_URL not configured.';
    }
    
    if (!this.userId) {
      logger.error('[woodland-qa-knowledge] userId not set');
      return 'Authentication error: Cannot search QA knowledge base.';
    }
    
    // Determine file IDs to search
    const fileIdsToSearch = this._getFileIdsToSearch();
    
    if (!fileIdsToSearch || fileIdsToSearch.length === 0) {
      return this.useFallbackMode 
        ? 'No files uploaded to this agent yet. Please upload QA documents via the UI or set WOODLAND_QA_FILE_ID for a dedicated knowledge base.'
        : 'QA Knowledge Base search unavailable: Knowledge base not indexed. Run scripts/indexQAKnowledge.js first.';
    }
    
    try {
      logger.debug('[woodland-qa-knowledge] Searching', {
        query: query.substring(0, 100),
        k,
        mode: this.useFallbackMode ? 'agent-files' : 'dedicated-kb',
        fileIds: fileIdsToSearch,
      });
      
      // Generate auth token
      const jwtToken = generateShortLivedToken(this.userId);
      
      // Query RAG API across all relevant files
      const allResults = [];
      
      for (const fileId of fileIdsToSearch) {
        try {
          const response = await axios.post(
            `${this.ragApiUrl}/query`,
            {
              file_id: fileId,
              query,
              k,
              entity_id: this.entityId,
            },
            {
              headers: {
                Authorization: `Bearer ${jwtToken}`,
                'Content-Type': 'application/json',
              },
              timeout: 10000,
            }
          );
          
          if (response.data && Array.isArray(response.data)) {
            allResults.push(...response.data.map(r => ({ ...r, fileId })));
          }
        } catch (fileError) {
          logger.warn('[woodland-qa-knowledge] Error querying file', {
            fileId,
            error: fileError.message,
          });
          // Continue with other files
        }
      }
      
      if (allResults.length === 0) {
        logger.debug('[woodland-qa-knowledge] No results found');
        return 'No matching answers found in the QA Knowledge Base. Proceed with general knowledge but add disclaimer that answer should be verified.';
      }
      
      // Sort by distance (best match first)
      allResults.sort((a, b) => a[1] - b[1]);
      
      // Take top k results
      const topResults = allResults.slice(0, k);
      
      // Format results
      const formattedResults = this._formatResults(topResults);
      
      logger.debug('[woodland-qa-knowledge] Search complete', {
        resultsCount: topResults.length,
        topScore: topResults[0]?.[1],
      });
      
      return formattedResults;
      
    } catch (error) {
      logger.error('[woodland-qa-knowledge] Search error:', error.message);
      
      if (error.response) {
        logger.error('[woodland-qa-knowledge] RAG API error:', {
          status: error.response.status,
          data: error.response.data,
        });
      }
      
      return `Error searching QA Knowledge Base: ${error.message}. Proceed carefully and recommend human review.`;
    }
  }
  
  /**
   * Get file IDs to search based on mode
   */
  _getFileIdsToSearch() {
    if (!this.useFallbackMode && this.qaFileId) {
      // Dedicated KB mode: use single file_id
      return [this.qaFileId];
    }
    
    // Fallback mode: use agent-uploaded files
    if (!this.agentFiles || this.agentFiles.length === 0) {
      return [];
    }
    
    // Extract file IDs from agent files
    // agentFiles can be array of strings (IDs) or objects with file_id property
    return this.agentFiles.map(f => {
      if (typeof f === 'string') return f;
      if (f.file_id) return f.file_id;
      if (f.id) return f.id;
      return null;
    }).filter(Boolean);
  }
  
  /**
   * Format search results into agent-friendly output
   */
  _formatResults(results) {
    const formatted = [];
    
    results.forEach(([docInfo, distance], index) => {
      const content = docInfo.page_content || '';
      const metadata = docInfo.metadata || {};
      const page = metadata.page;
      
      // Extract question ID if present
      const questionIdMatch = content.match(/###\s*Q([^:]+):/);
      const questionId = questionIdMatch ? questionIdMatch[1].trim() : null;
      
      // Extract question and answer
      const questionMatch = content.match(/###\s*Q[^:]+:\s*([^\n]+)/);
      const question = questionMatch ? questionMatch[1].trim() : '';
      
      const answerMatch = content.match(/\*\*Answer\*\*:\s*\n\n([\s\S]+?)(?=---|$)/);
      const answer = answerMatch ? answerMatch[1].trim() : content;
      
      // Calculate confidence (distance is typically 0-2, lower is better)
      const confidence = distance < 0.3 ? 'HIGH' : distance < 0.6 ? 'MEDIUM' : 'LOW';
      
      formatted.push({
        rank: index + 1,
        questionId,
        question,
        answer,
        confidence,
        distance: distance.toFixed(3),
        page,
      });
    });
    
    // Check for conflicts (multiple different answers with high confidence)
    const hasConflict = formatted.filter(r => r.confidence === 'HIGH').length > 1 &&
                        this._answersAreDifferent(formatted.slice(0, 2).map(r => r.answer));
    
    // Build output
    let output = '# QA Knowledge Base Results\n\n';
    
    if (hasConflict) {
      output += '⚠️ **CONFLICT DETECTED**: Multiple high-confidence answers found. Review all results and flag as "needs human review" if unclear.\n\n';
    }
    
    formatted.forEach(result => {
      output += `## Result ${result.rank} [${result.confidence} confidence, distance: ${result.distance}]\n\n`;
      
      if (result.questionId) {
        output += `**Question ID**: Q${result.questionId}\n\n`;
      }
      
      if (result.question) {
        output += `**Original Question**: ${result.question}\n\n`;
      }
      
      output += `**Verified Answer**:\n\n${result.answer}\n\n`;
      
      if (result.page) {
        output += `*Source: QA Knowledge Base, page ${result.page}*\n\n`;
      }
      
      output += '---\n\n';
    });
    
    // Add usage guidance
    if (formatted[0].confidence === 'HIGH' && !hasConflict) {
      output += '✅ **Recommendation**: Use the verified answer above directly or with minimal adaptation. This is a human-validated response.\n\n';
    } else if (hasConflict) {
      output += '⚠️ **Recommendation**: Multiple validated answers exist. Review context to determine which applies, or return "needs human review." Do NOT combine conflicting answers.\n\n';
    } else {
      output += '⚠️ **Recommendation**: No high-confidence match. You may synthesize an answer but add a disclaimer: "This information should be verified with our support team."\n\n';
    }
    
    return output;
  }
  
  /**
   * Check if two answers are substantially different
   */
  _answersAreDifferent(answers) {
    if (answers.length < 2) return false;
    
    // Simple heuristic: if answers share less than 50% of words, they're different
    const words1 = new Set(answers[0].toLowerCase().split(/\s+/));
    const words2 = new Set(answers[1].toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    const similarity = intersection.size / union.size;
    
    return similarity < 0.5;
  }
}

module.exports = WoodlandQAKnowledge;
