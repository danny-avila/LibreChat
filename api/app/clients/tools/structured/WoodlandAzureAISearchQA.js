/**
 * Woodland Azure AI Search QA Knowledge Base Tool
 * 
 * This tool queries Azure AI Search for human-validated QA pairs.
 * Complements the LibreChat RAG-based QA tool with:
 * - Azure AI Search semantic search capabilities
 * - Integration with existing Azure AI Search infrastructure
 * - Hybrid search (keyword + semantic + vector)
 * - Same guardrails: confidence scoring, conflict detection, escalation
 * 
 * Use this when:
 * - QA KB is indexed in Azure AI Search
 * - Want semantic search benefits
 * - Leveraging existing Azure AI Search setup
 */

const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { logger } = require('@librechat/data-schemas');

class WoodlandAzureAISearchQA extends Tool {
  static DEFAULT_API_VERSION = '2024-07-01';
  static DEFAULT_TOP = 3;
  static DEFAULT_SELECT = 'questionId,question,answer,model,component,category';
  static DEFAULT_QUERY_TYPE = 'semantic';
  
  // Confidence thresholds based on search score (0-100 scale for semantic search)
  static DEFAULT_HIGH_CONFIDENCE = 80;
  static DEFAULT_MEDIUM_CONFIDENCE = 60;

  constructor(fields = {}) {
    super();
    
    this.name = 'woodland-azure-ai-search-qa';
    this.description = `Search the Woodland QA Knowledge Base (Azure AI Search) for verified answers to common questions.
This knowledge base contains human-validated Q&A pairs and should be consulted FIRST before generating answers.
Use this when:
- Customer asks a question that might have been answered before
- You need to verify part numbers, policies, or technical details
- You want to ensure consistency with past answers
The tool returns the most relevant verified answer with citation and confidence scoring.`;

    this.schema = z.object({
      query: z.string().describe('The customer question or search query'),
      top: z.number().int().min(1).max(10).default(3).optional()
        .describe('Number of results to return (default: 3)'),
      filter: z.string().optional()
        .describe('OData filter (e.g., "model eq \'Classic\'" or "component eq \'Blade\'")'),
    });
    
    // Azure AI Search configuration
    this.serviceEndpoint = this._env(
      fields.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
      process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT,
    );
    
    this.indexName = this._env(
      fields.AZURE_AI_SEARCH_QA_INDEX,
      process.env.AZURE_AI_SEARCH_QA_INDEX || 'wpp-knowledge-qa',
    );
    
    this.apiKey = this._env(
      fields.AZURE_AI_SEARCH_API_KEY,
      process.env.AZURE_AI_SEARCH_API_KEY,
    );
    
    this.apiVersion = this._env(
      fields.AZURE_AI_SEARCH_API_VERSION,
      process.env.AZURE_AI_SEARCH_API_VERSION || WoodlandAzureAISearchQA.DEFAULT_API_VERSION,
    );
    
    // Query configuration
    this.queryType = this._env(
      fields.AZURE_AI_SEARCH_QA_QUERY_TYPE,
      process.env.AZURE_AI_SEARCH_QA_QUERY_TYPE || WoodlandAzureAISearchQA.DEFAULT_QUERY_TYPE,
    );
    
    this.semanticConfiguration = this._env(
      fields.AZURE_AI_SEARCH_QA_SEMANTIC_CONFIG,
      process.env.AZURE_AI_SEARCH_QA_SEMANTIC_CONFIG || 
      process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION || 'sem1',
    );
    
    this.select = this._env(
      fields.AZURE_AI_SEARCH_QA_SELECT,
      process.env.AZURE_AI_SEARCH_QA_SELECT || WoodlandAzureAISearchQA.DEFAULT_SELECT,
    );
    
    // Confidence thresholds
    this.highConfidenceThreshold = Number(
      this._env(
        fields.AZURE_AI_SEARCH_QA_HIGH_CONFIDENCE,
        process.env.AZURE_AI_SEARCH_QA_HIGH_CONFIDENCE || WoodlandAzureAISearchQA.DEFAULT_HIGH_CONFIDENCE,
      ),
    );
    
    this.mediumConfidenceThreshold = Number(
      this._env(
        fields.AZURE_AI_SEARCH_QA_MEDIUM_CONFIDENCE,
        process.env.AZURE_AI_SEARCH_QA_MEDIUM_CONFIDENCE || WoodlandAzureAISearchQA.DEFAULT_MEDIUM_CONFIDENCE,
      ),
    );
    
    if (!this.serviceEndpoint) {
      logger.warn('[woodland-azure-ai-search-qa] AZURE_AI_SEARCH_SERVICE_ENDPOINT not configured');
    }
    
    if (!this.apiKey) {
      logger.warn('[woodland-azure-ai-search-qa] AZURE_AI_SEARCH_API_KEY not configured');
    }
    
    if (!this.indexName) {
      logger.warn('[woodland-azure-ai-search-qa] AZURE_AI_SEARCH_QA_INDEX not configured');
    }
    
    // Initialize Azure AI Search client
    if (this.serviceEndpoint && this.apiKey && this.indexName) {
      this.client = new SearchClient(
        this.serviceEndpoint,
        this.indexName,
        new AzureKeyCredential(this.apiKey),
        { apiVersion: this.apiVersion },
      );
      
      logger.info('[woodland-azure-ai-search-qa] Initialized', {
        serviceEndpoint: this.serviceEndpoint,
        indexName: this.indexName,
        queryType: this.queryType,
        semanticConfiguration: this.semanticConfiguration,
      });
    } else {
      logger.error('[woodland-azure-ai-search-qa] Missing required configuration');
    }
  }
  
  _env(fieldValue, envValue) {
    return fieldValue ?? envValue;
  }
  
  async _call({ query, top = 3, filter }) {
    // Validate configuration
    if (!this.serviceEndpoint || !this.apiKey || !this.indexName) {
      return 'QA Knowledge Base search unavailable: Azure AI Search not properly configured.';
    }
    
    if (!this.client) {
      return 'QA Knowledge Base search unavailable: Search client not initialized.';
    }
    
    try {
      logger.debug('[woodland-azure-ai-search-qa] Searching QA KB', {
        query: query.substring(0, 100),
        top,
        filter,
        queryType: this.queryType,
      });
      
      // Build search options
      const searchOptions = {
        top,
        queryType: this.queryType,
        select: this.select ? this.select.split(',').map(s => s.trim()) : undefined,
      };
      
      // Add semantic configuration if using semantic search
      if (this.queryType === 'semantic' && this.semanticConfiguration) {
        searchOptions.semanticSearchOptions = {
          configurationName: this.semanticConfiguration,
        };
      }
      
      // Add filter if provided
      if (filter) {
        searchOptions.filter = filter;
      }
      
      // Execute search
      const searchResults = await this.client.search(query, searchOptions);
      
      // Collect results
      const results = [];
      for await (const result of searchResults.results) {
        results.push({
          document: result.document,
          score: result.score,
          rerankerScore: result.rerankerScore, // Semantic search reranker score
        });
      }
      
      if (results.length === 0) {
        logger.debug('[woodland-azure-ai-search-qa] No results found');
        return 'No matching answers found in the QA Knowledge Base. Proceed with general knowledge but add disclaimer that answer should be verified.';
      }
      
      // Format results with confidence scoring
      const formattedResults = this._formatResults(results);
      
      logger.debug('[woodland-azure-ai-search-qa] Search complete', {
        resultsCount: results.length,
        topScore: results[0]?.score,
        topRerankerScore: results[0]?.rerankerScore,
      });
      
      return formattedResults;
      
    } catch (error) {
      logger.error('[woodland-azure-ai-search-qa] Search error:', error.message);
      
      if (error.statusCode) {
        logger.error('[woodland-azure-ai-search-qa] Azure AI Search error:', {
          status: error.statusCode,
          message: error.message,
        });
      }
      
      return `Error searching QA Knowledge Base: ${error.message}. Proceed carefully and recommend human review.`;
    }
  }
  
  /**
   * Format search results into agent-friendly output with confidence scoring
   */
  _formatResults(results) {
    const formatted = [];
    
    results.forEach((result, index) => {
      const doc = result.document;
      
      // Use reranker score if available (semantic search), otherwise use regular score
      const score = result.rerankerScore ?? result.score ?? 0;
      
      // Normalize score to 0-100 scale
      // Semantic reranker scores are typically 0-4, regular scores 0-1
      const normalizedScore = result.rerankerScore 
        ? (result.rerankerScore / 4) * 100  // Semantic: 0-4 → 0-100
        : result.score * 100;                // Regular: 0-1 → 0-100
      
      // Calculate confidence
      const confidence = normalizedScore >= this.highConfidenceThreshold 
        ? 'HIGH' 
        : normalizedScore >= this.mediumConfidenceThreshold 
          ? 'MEDIUM' 
          : 'LOW';
      
      formatted.push({
        rank: index + 1,
        questionId: doc.questionId,
        question: doc.question,
        answer: doc.answer,
        model: doc.model,
        component: doc.component,
        category: doc.category,
        confidence,
        score: normalizedScore.toFixed(1),
        rawScore: score,
      });
    });
    
    // Check for conflicts (multiple different answers with high confidence)
    const hasConflict = formatted.filter(r => r.confidence === 'HIGH').length > 1 &&
                        this._answersAreDifferent(formatted.slice(0, 2).map(r => r.answer));
    
    // Build output
    let output = '# QA Knowledge Base Results (Azure AI Search)\n\n';
    
    if (hasConflict) {
      output += '⚠️ **CONFLICT DETECTED**: Multiple high-confidence answers found. Review all results and flag as "needs human review" if unclear.\n\n';
    }
    
    formatted.forEach(result => {
      output += `## Result ${result.rank} [${result.confidence} confidence, score: ${result.score}]\n\n`;
      
      if (result.questionId) {
        output += `**Question ID**: ${result.questionId}\n\n`;
      }
      
      if (result.question) {
        output += `**Original Question**: ${result.question}\n\n`;
      }
      
      output += `**Verified Answer**:\n\n${result.answer}\n\n`;
      
      // Add metadata
      const metadata = [];
      if (result.model) metadata.push(`Model: ${result.model}`);
      if (result.component) metadata.push(`Component: ${result.component}`);
      if (result.category) metadata.push(`Category: ${result.category}`);
      
      if (metadata.length > 0) {
        output += `*${metadata.join(' | ')}*\n\n`;
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

module.exports = WoodlandAzureAISearchQA;
WoodlandAzureAISearchQA.enableReusableInstance = true;
