const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');

/**
 * Tool for Perplexity API web search via chat/completions (Sonar models).
 * Uses PERPLEXITY_API_KEY or PPLX_API_KEY for authentication.
 */
class PerplexitySearch extends Tool {
  static lc_name() {
    return 'PerplexitySearch';
  }

  constructor(fields = {}) {
    super();
    this.name = 'perplexity_search';
    this.description =
      "Use Perplexity's research models to search the web and return an evidence-backed answer with cited sources.";

    // Allow initialization without credentials when override=true (used during bootstrap formatting)
    this.override = fields.override ?? false;
    // Accept either env var; UI manifest passes whichever is configured
    this.apiKey =
      fields.PERPLEXITY_API_KEY ||
      fields.PPLX_API_KEY ||
      getEnvironmentVariable('PERPLEXITY_API_KEY') ||
      getEnvironmentVariable('PPLX_API_KEY');

    if (!this.apiKey && !this.override) {
      throw new Error(
        'Missing PERPLEXITY_API_KEY or PPLX_API_KEY environment variable or user credential.',
      );
    }

    // Optional knobs; default model is Sonar (web-enabled)
    this.model = fields.model || 'sonar';

    this.schema = z.object({
      query: z.string().min(1).describe('The search query or instruction.'),
      max_tokens: z.number().int().positive().optional(),
      temperature: z.number().min(0).max(1).optional(),
      top_p: z.number().min(0).max(1).optional(),
      search_recency_filter: z
        .enum(['day', 'week', 'month', 'year', 'all_time'])
        .optional()
        .describe('Bias results toward recent content.'),
      return_images: z.boolean().optional(),
      system_prompt: z
        .string()
        .optional()
        .describe('Optional system instruction to steer the answer.'),
    });
  }

  async _call(input) {
    const validation = this.schema.safeParse(input);
    if (!validation.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validation.error.issues)}`);
    }

    const {
      query,
      max_tokens,
      temperature,
      top_p,
      search_recency_filter,
      return_images,
      system_prompt,
    } = validation.data;

    const body = {
      model: this.model,
      messages: [
        ...(system_prompt ? [{ role: 'system', content: system_prompt }] : []),
        { role: 'user', content: query },
      ],
      // Perplexity defaults; include only if provided
      ...(max_tokens != null ? { max_tokens } : {}),
      ...(temperature != null ? { temperature } : {}),
      ...(top_p != null ? { top_p } : {}),
      ...(search_recency_filter ? { search_recency_filter } : {}),
      ...(return_images != null ? { return_images } : {}),
      stream: false,
    };

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const json = await response.json();
      if (!response.ok) {
        const message = json?.error?.message || json?.message || response.statusText;
        throw new Error(`Perplexity API error ${response.status}: ${message}`);
      }

      const answer = json?.choices?.[0]?.message?.content?.trim();
      const citations = json?.citations;

      if (!answer && !citations) {
        return 'No response found from Perplexity API.';
      }

      const sourcesText = Array.isArray(citations) && citations.length
        ? '\n\nSources:\n - ' + citations.join('\n - ')
        : '';

      return (answer || 'No direct answer provided.') + sourcesText;
    } catch (err) {
      console.error('Perplexity API request failed', err);
      return `Perplexity API request failed: ${err.message}`;
    }
  }
}

module.exports = PerplexitySearch;
