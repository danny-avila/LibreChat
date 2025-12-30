const { createAxiosInstance } = require('@librechat/api');

/**
 * Client for interacting with Piston API
 */
class PistonClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.axios = createAxiosInstance();
  }

  /**
   * Execute code on Piston
   * @param {Object} request - Execution request
   * @param {string} request.language - Programming language
   * @param {string} request.version - Language version
   * @param {Array} request.files - Array of files to execute
   * @returns {Promise<Object>} Execution result
   */
  async execute(request) {
    // Build execution parameters - only include if env var is set, otherwise Piston uses its defaults
    const executionParams = {
      language: request.language,
      version: request.version,
      files: request.files,
    };

    // Add optional execution limits from environment variables
    if (process.env.PISTON_RUN_TIMEOUT) {
      executionParams.run_timeout = parseInt(process.env.PISTON_RUN_TIMEOUT, 10);
    }

    if (process.env.PISTON_COMPILE_TIMEOUT) {
      executionParams.compile_timeout = parseInt(process.env.PISTON_COMPILE_TIMEOUT, 10);
    }

    if (process.env.PISTON_RUN_MEMORY_LIMIT) {
      executionParams.run_memory_limit = parseInt(process.env.PISTON_RUN_MEMORY_LIMIT, 10);
    }

    if (process.env.PISTON_COMPILE_MEMORY_LIMIT) {
      executionParams.compile_memory_limit = parseInt(process.env.PISTON_COMPILE_MEMORY_LIMIT, 10);
    }

    if (process.env.PISTON_OUTPUT_MAX_SIZE) {
      executionParams.output_max_size = parseInt(process.env.PISTON_OUTPUT_MAX_SIZE, 10);
    }

    const response = await this.axios.post(`${this.baseUrl}/execute`, executionParams, {
      timeout: 30000, // 30 second HTTP timeout for code execution
    });
    return response.data;
  }

  /**
   * Get available runtimes from Piston
   * @returns {Promise<Array>} Array of available runtimes
   */
  async getRuntimes() {
    const response = await this.axios.get(`${this.baseUrl}/runtimes`, {
      timeout: 5000,
    });
    return response.data;
  }
}

module.exports = { PistonClient };
