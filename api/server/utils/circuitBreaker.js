/**
 * Circuit Breaker for Agent Tool Calls
 *
 * Monitors repeated tool failures and provides intervention to prevent infinite loops.
 * This addresses recursion limit issues when agents repeatedly call failing tools.
 */

const { logger } = require('@librechat/data-schemas');

/**
 * Creates a circuit breaker that tracks tool failures across an agent run
 * @param {Object} options - Configuration options
 * @param {number} options.maxFailures - Maximum failures before circuit opens (default: 3)
 * @param {number} options.windowSize - Number of recent calls to track (default: 5)
 * @param {Function} options.onCircuitOpen - Callback when circuit opens
 * @returns {Object} Circuit breaker instance
 */
function createCircuitBreaker(options = {}) {
  const {
    maxFailures = 3,
    windowSize = 5,
    onCircuitOpen = null,
  } = options;

  // Track tool call history: { toolName: [{ success: boolean, timestamp: number }] }
  const toolHistory = new Map();

  // Track if circuit is open (blocking further calls)
  let circuitOpen = false;

  // Track overall statistics
  const stats = {
    totalCalls: 0,
    totalFailures: 0,
    consecutiveFailures: 0,
  };

  /**
   * Record a tool call result
   * @param {string} toolName - Name of the tool
   * @param {boolean} success - Whether the call succeeded
   * @param {any} error - Error object if failed
   */
  function recordToolCall(toolName, success, error = null) {
    if (!toolHistory.has(toolName)) {
      toolHistory.set(toolName, []);
    }

    const history = toolHistory.get(toolName);
    history.push({
      success,
      timestamp: Date.now(),
      error: error?.message || error,
    });

    // Keep only recent history
    if (history.length > windowSize) {
      history.shift();
    }

    stats.totalCalls++;
    if (!success) {
      stats.totalFailures++;
      stats.consecutiveFailures++;
    } else {
      stats.consecutiveFailures = 0;
    }

    // Check if we should open the circuit
    if (shouldOpenCircuit(toolName)) {
      circuitOpen = true;
      logger.warn(
        `[Circuit Breaker] Circuit opened for tool "${toolName}". ` +
        `Failures: ${getFailureCount(toolName)}/${windowSize} in window. ` +
        `Total consecutive failures: ${stats.consecutiveFailures}`,
      );

      if (onCircuitOpen) {
        onCircuitOpen(toolName, {
          failureCount: getFailureCount(toolName),
          windowSize,
          history: history.slice(),
          stats: { ...stats },
        });
      }
    }
  }

  /**
   * Check if circuit should open for a tool
   * @param {string} toolName - Name of the tool
   * @returns {boolean} True if circuit should open
   */
  function shouldOpenCircuit(toolName) {
    const history = toolHistory.get(toolName);
    if (!history || history.length < maxFailures) {
      return false;
    }

    // Check recent window
    const recentHistory = history.slice(-windowSize);
    const recentFailures = recentHistory.filter((call) => !call.success).length;

    return recentFailures >= maxFailures;
  }

  /**
   * Get failure count for a tool in recent window
   * @param {string} toolName - Name of the tool
   * @returns {number} Number of failures
   */
  function getFailureCount(toolName) {
    const history = toolHistory.get(toolName);
    if (!history) {
      return 0;
    }
    return history.filter((call) => !call.success).length;
  }

  /**
   * Check if a tool should be blocked
   * @param {string} toolName - Name of the tool
   * @returns {boolean} True if tool should be blocked
   */
  function shouldBlockTool(toolName) {
    return circuitOpen && shouldOpenCircuit(toolName);
  }

  /**
   * Get warning message if tool is at risk
   * @param {string} toolName - Name of the tool
   * @returns {string|null} Warning message or null
   */
  function getWarningMessage(toolName) {
    const failureCount = getFailureCount(toolName);
    if (failureCount >= maxFailures - 1 && failureCount < maxFailures) {
      return (
        `⚠️ Tool "${toolName}" has failed ${failureCount} times recently. ` +
        `One more failure will trigger circuit breaker. ` +
        `Consider trying a different approach.`
      );
    }
    if (shouldBlockTool(toolName)) {
      return (
        `🚫 Circuit breaker activated for tool "${toolName}". ` +
        `This tool has failed ${failureCount}/${windowSize} times. ` +
        `Please try a different approach or ask the user for guidance.`
      );
    }
    return null;
  }

  /**
   * Reset the circuit breaker
   */
  function reset() {
    toolHistory.clear();
    circuitOpen = false;
    stats.totalCalls = 0;
    stats.totalFailures = 0;
    stats.consecutiveFailures = 0;
  }

  /**
   * Get current statistics
   * @returns {Object} Statistics object
   */
  function getStats() {
    const toolStats = {};
    for (const [toolName, history] of toolHistory.entries()) {
      toolStats[toolName] = {
        calls: history.length,
        failures: history.filter((call) => !call.success).length,
        successRate: history.filter((call) => call.success).length / history.length,
      };
    }

    return {
      ...stats,
      circuitOpen,
      tools: toolStats,
    };
  }

  return {
    recordToolCall,
    shouldBlockTool,
    getWarningMessage,
    getStats,
    reset,
    isOpen: () => circuitOpen,
  };
}

module.exports = {
  createCircuitBreaker,
};
